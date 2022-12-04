/*
 Collects hardcoded strings and wraps them in translation hook

 Useful resources: 
  1. https://ts-ast-viewer.com/
  2. https://astexplorer.net/
*/
import {
  Transform,
  ASTPath,
  JSCodeshift,
  Collection,
} from "jscodeshift/src/core";
import fs from "fs";
import stringify from "json-stable-stringify";
import _ from "lodash";
import slugify from "slugify";
import { namedTypes } from "ast-types";

const CURRENCIES_SYMBOLS = ["$", "€", "£", "¥", "₽", "₺", "₹", "₩", "₪", "₴"];
const NUMBERS_STRING = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
const SPECIAL_CHARACTERS = [
  "©",
  "!",
  "?",
  ".",
  ",",
  ":",
  ";",
  "%",
  "#",
  "@",
  "^",
  "&",
  "*",
  "|",
  "\\",
  "/",
  "<",
  ">",
  "~",
  "`",
  "'",
  '"',
  " ",
  "",
  "-",
  "_",
  "=",
  "+",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  "·",
];

/**
 * If JSXText is any of the following, it won't be translated
 */
const TRANSLATION_BLACKLIST = [
  ...NUMBERS,
  ...NUMBERS_STRING,
  ...SPECIAL_CHARACTERS,
  ...CURRENCIES_SYMBOLS,
];

const isUpperCase = (s: string) => /^[A-Z].*$/.test(s);

const readTranslations = (path: string, translationRoot?: string) => {
  try {
    const data = fs.readFileSync(path, "utf8");
    const parsedTranslations = JSON.parse(data);

    return translationRoot
      ? parsedTranslations[translationRoot]
      : parsedTranslations;
  } catch (e) {
    // does not exist
    return {};
  }
};

const writeTranslations = (
  path: string,
  translations: Record<string, any>,
  translationRoot?: string
) => {
  if (translationRoot) {
    translations = { [translationRoot]: translations };
  }

  const result = stringify(translations, { space: 2 });
  fs.writeFileSync(path, result);
};

const addTranslation = (
  translations: Record<string, any>,
  component: string,
  key: string,
  text: string
) => {
  translations[component] = {
    ...translations[component],
    [key]: text,
  };
};

const getFunctionName = (j: JSCodeshift, fd: ASTPath) => {
  if (j.ArrowFunctionExpression.check(fd.value))
    return fd.parentPath?.value?.id?.name;

  if (j.FunctionDeclaration.check(fd.value)) return fd.value?.id?.name;

  return "UnknownFunction";
};

const getImportStatements = (
  j: JSCodeshift,
  root: Collection<any>,
  importName: string
) => {
  return root.find(j.ImportDeclaration, { source: { value: importName } });
};

const getClosestFunctionAST = (j: JSCodeshift, path: ASTPath) => {
  if (!path) return null;

  if (
    j.FunctionDeclaration.check(path.value) ||
    j.ArrowFunctionExpression.check(path.value)
  )
    return path;

  return getClosestFunctionAST(j, path.parentPath);
};

const createUseTranslationImport = (j: JSCodeshift, importPackage: string) =>
  j.importDeclaration(
    [j.importSpecifier(j.identifier("useTranslation"))],
    j.stringLiteral(importPackage)
  );

const createTranslationHook = (j: JSCodeshift) =>
  j.variableDeclaration.from({
    kind: "const",
    declarations: [
      j.variableDeclarator.from({
        id: j.objectPattern([
          j.objectProperty.from({
            key: j.identifier("t"),
            value: j.identifier("t"),
            shorthand: true,
          }),
        ]),
        init: j.callExpression.from({
          callee: j.identifier("useTranslation"),
          arguments: [],
        }),
      }),
    ],
  });

const TRANSLATION_KEY_MAX_LENGTH = 40;

const createTranslationKey = (
  text: string,
  keyMaxLength: number = TRANSLATION_KEY_MAX_LENGTH
) => {
  return slugify(text, {
    remove: /[*+~.()'"!:@]/g,
    lower: true,
    strict: true,
    trim: true,
  }).slice(0, keyMaxLength);
};

const addTranslationPackageImport = (
  j: JSCodeshift,
  root: Collection<any>,
  importPackage: string
) => {
  const newUseTranslationImport = createUseTranslationImport(j, importPackage);
  root.find(j.ImportDeclaration).at(0).insertBefore(newUseTranslationImport);
};

const findCallExpressions = (
  j: JSCodeshift,
  reactComponent: ASTPath<namedTypes.FunctionDeclaration>,
  callExpressionName: string
) => {
  return j(reactComponent)
    .find(j.CallExpression)
    .filter((path) => {
      if (path.value.callee.type !== "Identifier") return false;
      if (path.value.callee.name !== callExpressionName) return false;

      return true;
    });
};

const sanitizeText = (text: string) => {
  return text.replace(/\s+/g, " ").trim();
};

const TEMPLATE_LITERAL_BLACKLIST = ["className", "href", "src", "key"];

/**
 * Translates template literals like `Hello ${name}`
 * @param j 
 * @param root 
 * @param translations 
 * @param importPackage 
 */
const translateTemplateLiterals = (
  j: JSCodeshift,
  root: Collection<any>,
  translations: Record<string, any>,
  importPackage: string
) => {
  root
    .find(j.TemplateLiteral)
    .filter((path) => {
      // if the template literal is inside a JSX attribute, check if it's not blacklisted
      // for example <div className={`text-{color}`}"></div>
      if (
        j.JSXAttribute.check(path.parentPath.parentPath.value) &&
        TEMPLATE_LITERAL_BLACKLIST.includes(
          path.parentPath.parentPath.value.name.name
        )
      )
        return false;

      if (path.parentPath.value.type === "TaggedTemplateExpression")
        return false;

      return true;
    })
    .replaceWith((path) => {
      // get the top level react component where the hardcoded text is
      const functionAST = getClosestFunctionAST(j, path);
      if (!functionAST) {
        return path; // technically, should not happen as we are filtering for JSXAttribute, but just in case
      }

      const componentName = _.lowerFirst(getFunctionName(j, functionAST));

      let text = "";
      const expressions = j.objectExpression([]);

      let i = 0;
      for (; i < path.value.expressions.length; ++i) {
        const expression = path.value.expressions[i];
        const expressionKey = _.camelCase(j(expression).toSource());
        text += `${path.value.quasis[i].value.cooked}{{${expressionKey}}}`;

        expressions.properties.push(
          j.objectProperty.from({
            key: j.identifier(expressionKey),
            value: expression,
            shorthand:
              expression.type === "Identifier" &&
              expression.name === expressionKey,
          })
        );
      }
      text += path.value.quasis[i].value.cooked;

      const value = sanitizeText(text);
      const key = createTranslationKey(value);
      addTranslation(translations, componentName, key, value);

      // import translation package provided via `importPackage` option if needed
      const translationPackageImports = getImportStatements(
        j,
        root,
        importPackage
      );
      if (translationPackageImports.length === 0) {
        addTranslationPackageImport(j, root, importPackage);
      }

      // add translation hook to the top of the component, if it's not already there
      const useTranslationsCallExpressions = findCallExpressions(
        j,
        functionAST,
        "useTranslation"
      );
      if (useTranslationsCallExpressions.length == 0) {
        const hook = createTranslationHook(j);
        functionAST.value.body.body.unshift(hook);
      }

      console.log(
        `Found not translated template literal in "${componentName}": replacing "${value}" with "${componentName}.${key}".`
      );

      return j.callExpression.from({
        callee: j.identifier("t"),
        arguments: [j.literal(`${componentName}.${key}`), expressions],
      });
    });
};

const JSX_ATTRIBUTES_TO_TRANSLATE = ["alt", "title", "description"];

/**
 * Translates React component props that are in the JSX_ATTRIBUTES_TO_TRANSLATE array
 * for example:
 * <img alt="Hello world" />
 * will be translated to
 * <img alt={t("imgAltHelloWorld")} />
 * @param j
 * @param root
 * @param translations
 * @param importPackage
 */
const translateJSXAttributes = (
  j: JSCodeshift,
  root: Collection<any>,
  translations: Record<string, any>,
  importPackage: string
) => {
  root
    .find(j.JSXAttribute)
    .filter((path) => {
      if (!j.StringLiteral.check(path.value.value)) return false;

      const jsxAttrubute = path.value.name.name;
      if (typeof jsxAttrubute !== "string") return false;
      if (!JSX_ATTRIBUTES_TO_TRANSLATE.includes(jsxAttrubute)) return false;

      return true;
    })
    .replaceWith((path) => {
      // for some reason typescipt doesn't know that we are filtering for StringLiteral above
      if (!j.StringLiteral.check(path.value.value)) return false;
      // get the top level react component where the hardcoded text is
      const functionAST = getClosestFunctionAST(j, path);
      if (!functionAST) {
        return path; // technically, should not happen as we are filtering for JSXAttribute, but just in case
      }

      const componentName = _.lowerFirst(getFunctionName(j, functionAST));
      const value = sanitizeText(path.value.value.value); // o_O
      const key = createTranslationKey(value);
      addTranslation(translations, componentName, key, value);

      // import translation package provided via `importPackage` option if needed
      const translationPackageImports = getImportStatements(
        j,
        root,
        importPackage
      );
      if (translationPackageImports.length === 0) {
        addTranslationPackageImport(j, root, importPackage);
      }

      // add translation hook to the top of the component, if it's not already there
      const useTranslationsCallExpressions = findCallExpressions(
        j,
        functionAST,
        "useTranslation"
      );
      if (useTranslationsCallExpressions.length == 0) {
        const hook = createTranslationHook(j);
        functionAST.value.body.body.unshift(hook);
      }

      console.log(
        `Found not translated prop in "${componentName}": replacing "${value}" with "${componentName}.${key}".`
      );

      // replace hardcoded text with t('key') call
      return j.jsxAttribute.from({
        name: path.value.name,
        value: j.jsxExpressionContainer.from({
          expression: j.callExpression.from({
            callee: j.identifier("t"),
            arguments: [j.literal(`${componentName}.${key}`)],
          }),
        }),
      });
    });
};

/**
 * Translates <p>text</p> to <p>{t('text')}</p>
 * @param j jscodeshift
 * @param root parsed AST of provideded source code
 * @param translations parsed translation file content (JSON)
 * @param importPackage name of the import package (e.g. react-i18next) to add when translation is added
 */
const translateJSXTextContent = (
  j: JSCodeshift,
  root: Collection<any>,
  translations: Record<string, any>,
  importPackage: string
) => {
  root
    .find(j.JSXText)
    .filter((path) => !TRANSLATION_BLACKLIST.includes(path.node.value.trim()))
    .replaceWith((path) => {
      // get the top level react component where the hardcoded text is
      const functionAST = getClosestFunctionAST(j, path);
      if (!functionAST) {
        return path; // technically, should not happen as we are filtering for JSXText, but just in case
      }

      const componentName = _.lowerFirst(getFunctionName(j, functionAST));
      const value = sanitizeText(path.node.value);
      const key = createTranslationKey(value);
      addTranslation(translations, componentName, key, value);

      // import translation package provided via `importPackage` option if needed
      const translationPackageImports = getImportStatements(
        j,
        root,
        importPackage
      );
      if (translationPackageImports.length === 0) {
        addTranslationPackageImport(j, root, importPackage);
      }

      // add translation hook to the top of the component, if it's not already there
      const useTranslationCallExpressions = findCallExpressions(
        j,
        functionAST,
        "useTranslation"
      );
      if (useTranslationCallExpressions.length === 0) {
        const hook = createTranslationHook(j);
        functionAST.value.body.body.unshift(hook);
      }

      console.log(
        `Found not translated text in "${componentName}": replacing "${value}" with "${componentName}.${key}".`
      );

      // replace hardcoded text with t('key') call
      return j.jsxExpressionContainer(
        j.callExpression(j.identifier("t"), [
          j.literal(`${componentName}.${key}`),
        ])
      );
    });
};

/**
 * Called by jscodeshift when running the transform
 * @param fileInfo
 * @param api
 * @param options
 */
const transform: Transform = (fileInfo, api, options) => {
  const j = api.jscodeshift;
  const { source } = fileInfo;
  const { translationFilePath, translationRoot, importName } = options;

  if (!translationFilePath) {
    throw new Error("No translation file path provided! Aborting.");
  }

  if (!importName) {
    throw new Error(
      "No import name provided (e.g. react-i18next, i18next, next-i18next)! Aborting."
    );
  }

  const translations = readTranslations(translationFilePath, translationRoot);
  const root = j(source);

  translateJSXTextContent(j, root, translations, importName);
  translateJSXAttributes(j, root, translations, importName);
  translateTemplateLiterals(j, root, translations, importName);

  writeTranslations(translationFilePath, translations, translationRoot);

  return root.toSource({
    quote: "single",
  });
};

module.exports = transform;
module.exports.parser = "tsx";
