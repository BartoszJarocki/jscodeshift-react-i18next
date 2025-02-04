/**
 * A codemod that extracts hardcoded strings from React components and wraps them in translation hooks.
 *
 * Features:
 * - Extracts text from JSX elements
 * - Handles translatable attributes (alt, title, description)
 * - Supports template literals with variables
 * - Automatically generates translation keys
 * - Updates translation files
 * - Adds necessary imports and hooks
 *
 * @example
 * // Input:
 * function Welcome() {
 *   return <div>Hello World</div>
 * }
 *
 * // Output:
 * import { useTranslation } from 'react-i18next';
 *
 * function Welcome() {
 *   const { t } = useTranslation();
 *   return <div>{t('welcome.hello-world')}</div>
 * }
 */

import {
  Transform,
  FileInfo,
  API,
  Options,
  ASTPath,
  JSCodeshift,
  Collection,
} from 'jscodeshift';
import { namedTypes, NodePath } from 'ast-types';
import fs from 'fs';
import stringify from 'json-stable-stringify';
import _ from 'lodash';
import slugify from 'slugify';

/**
 * Type Definitions
 */
interface TranslationEntry {
  [key: string]: string;
}

interface Translations {
  [componentName: string]: TranslationEntry;
}

interface TransformOptions extends Options {
  translationFilePath: string;
  translationRoot?: string;
  importName: string;
}

interface TransformContext {
  j: JSCodeshift;
  root: Collection;
  translations: Translations;
  importPackage: string;
}

type TranslatableAttribute =
  (typeof CONSTANTS.JSX_ATTRIBUTES_TO_TRANSLATE)[number];

const BLACKLIST_TRANSLATION_CHARS = {
  NUMBERS: '0123456789',
  CURRENCIES: '$€£¥₽₺₹₩₪₴',
  PUNCTUATION: '.,!?:;\'"`',
  MATH: '+=-*/%<>',
  BRACKETS: '()[]{}«»',
  SPECIAL: '@#$^&|\\~·©',
  SEPARATORS: [' ', '', '-', '_'],
} as const;

/**
 * Constants used throughout the codemod
 */
const CONSTANTS = {
  // Maximum length for generated translation keys
  TRANSLATION_KEY_MAX_LENGTH: 40,

  // JSX attributes that should be translated
  JSX_ATTRIBUTES_TO_TRANSLATE: [
    'alt',
    'aria-label',
    'title',
    'description',
  ] as const, // Add more attributes as needed

  // Template literals in these attributes will be ignored
  TEMPLATE_LITERAL_BLACKLIST: ['className', 'href', 'src', 'key'] as const,

  // Text content matching these will not be translated
  TRANSLATION_BLACKLIST: [
    ...BLACKLIST_TRANSLATION_CHARS.NUMBERS.split(''),
    ...BLACKLIST_TRANSLATION_CHARS.CURRENCIES.split(''),
    ...BLACKLIST_TRANSLATION_CHARS.PUNCTUATION.split(''),
    ...BLACKLIST_TRANSLATION_CHARS.MATH.split(''),
    ...BLACKLIST_TRANSLATION_CHARS.BRACKETS.split(''),
    ...BLACKLIST_TRANSLATION_CHARS.SPECIAL.split(''),
    ...BLACKLIST_TRANSLATION_CHARS.SEPARATORS,
  ] as const,
} as const;

/**
 * File Operations
 */

/**
 * Reads translations from a JSON file
 * @param path - Path to the translation file
 * @param translationRoot - Optional root key in the translation file
 * @returns Translation object
 *
 * @example
 * // translations.json
 * {
 *   "en": {
 *     "component": {
 *       "hello": "Hello"
 *     }
 *   }
 * }
 * readTranslations('translations.json', 'en')
 * // Returns: { component: { hello: 'Hello' } }
 */
const readTranslations = (
  path: string,
  translationRoot?: string
): Translations => {
  try {
    const data = fs.readFileSync(path, 'utf8');
    const parsedTranslations = JSON.parse(data);
    return translationRoot
      ? parsedTranslations[translationRoot]
      : parsedTranslations;
  } catch {
    return {};
  }
};

/**
 * Writes translations to a JSON file
 * @param path - Path to the translation file
 * @param translations - Translation object to write
 * @param translationRoot - Optional root key in the translation file
 */
const writeTranslations = (
  path: string,
  translations: Translations,
  translationRoot?: string
): void => {
  const finalTranslations = translationRoot
    ? { [translationRoot]: translations }
    : translations;
  const result = stringify(finalTranslations, { space: 2 });
  fs.writeFileSync(path, result);
};

/**
 * AST Utilities
 */

/**
 * Extracts the function name from an AST path
 * @param j - JSCodeshift instance
 * @param fd - AST path of a function declaration or expression
 * @returns The function name or 'UnknownFunction' if not found
 *
 * @example
 * // For: function MyComponent() {}
 * getFunctionName(j, path) // Returns: 'MyComponent'
 *
 * // For: const MyComponent = () => {}
 * getFunctionName(j, path) // Returns: 'MyComponent'
 */
const getFunctionName = (
  j: JSCodeshift,
  fd: ASTPath<
    namedTypes.FunctionDeclaration | namedTypes.ArrowFunctionExpression
  >
): string => {
  if (j.ArrowFunctionExpression.check(fd.value)) {
    return fd.parentPath?.value?.id?.name ?? 'UnknownFunction';
  }
  if (j.FunctionDeclaration.check(fd.value)) {
    return fd.value?.id?.name ?? 'UnknownFunction';
  }
  return 'UnknownFunction';
};

/**
 * Finds the closest function declaration or arrow function in the AST
 * Used to determine which component a string belongs to
 *
 * @param j - JSCodeshift instance
 * @param path - Current AST path
 * @returns The AST path of the closest function or null if not found
 */
const getClosestFunctionAST = (
  j: JSCodeshift,
  path: ASTPath
): ASTPath<
  namedTypes.FunctionDeclaration | namedTypes.ArrowFunctionExpression
> | null => {
  if (!path) return null;

  if (
    j.FunctionDeclaration.check(path.value) ||
    j.ArrowFunctionExpression.check(path.value)
  ) {
    return path as ASTPath<
      namedTypes.FunctionDeclaration | namedTypes.ArrowFunctionExpression
    >;
  }

  return getClosestFunctionAST(j, path.parentPath);
};

/**
 * Creates a translation key from a text string
 * @param text - The text to create a key from
 * @returns A slugified, lowercase string limited to max length
 *
 * @example
 * createTranslationKey('Hello World!') // Returns: 'hello-world'
 * createTranslationKey('This is a very long text that needs to be truncated')
 * // Returns: 'this-is-a-very-long-text-that-needs-to-be-tr'
 */
const createTranslationKey = (text: string): string => {
  return slugify(text, {
    remove: /[*+~.()'"!:@]/g,
    lower: true,
    strict: true,
    trim: true,
  }).slice(0, CONSTANTS.TRANSLATION_KEY_MAX_LENGTH);
};

/**
 * Sanitizes text by removing extra whitespace
 * @param text - The text to sanitize
 * @returns Cleaned text with single spaces
 *
 * @example
 * sanitizeText('Hello    World  !') // Returns: 'Hello World !'
 * sanitizeText('\n  Hello\n  World  \n') // Returns: 'Hello World'
 */
const sanitizeText = (text: string): string => {
  return text.replace(/\s+/g, ' ').trim();
};

/**
 * Translation Setup Utilities
 */

/**
 * Ensures the translation import exists in the file
 * Adds import { useTranslation } from 'package' if it doesn't exist
 *
 * @param context - Transform context
 */
const ensureTranslationImport = ({
  j,
  root,
  importPackage,
}: TransformContext): void => {
  const hasImport =
    root
      .find(j.ImportDeclaration)
      .filter((path) => path.value.source.value === importPackage).length > 0;

  if (!hasImport) {
    const importDecl = j.importDeclaration(
      [j.importSpecifier(j.identifier('useTranslation'))],
      j.literal(importPackage)
    );
    root.find(j.ImportDeclaration).at(0).insertBefore(importDecl);
  }
};

/**
 * Ensures the useTranslation hook is present in the component
 * Adds const { t } = useTranslation(); if it doesn't exist
 *
 * @param context - Transform context
 * @param functionAST - AST path of the component function
 *
 * @example
 * // Input:
 * function MyComponent() {
 *   return <div>Hello</div>
 * }
 *
 * // Output:
 * function MyComponent() {
 *   const { t } = useTranslation();
 *   return <div>Hello</div>
 * }
 */
const ensureTranslationHook = (
  { j }: TransformContext,
  functionAST: ASTPath<
    namedTypes.FunctionDeclaration | namedTypes.ArrowFunctionExpression
  >
): void => {
  const hasHook =
    j(functionAST)
      .find(j.CallExpression)
      .filter(
        (path) =>
          path.value.callee.type === 'Identifier' &&
          path.value.callee.name === 'useTranslation'
      ).length > 0;

  if (!hasHook) {
    const hook = j.variableDeclaration('const', [
      j.variableDeclarator(
        j.objectPattern([
          j.objectProperty.from({
            key: j.identifier('t'),
            value: j.identifier('t'),
            shorthand: true,
          }),
        ]),
        j.callExpression(j.identifier('useTranslation'), [])
      ),
    ]);

    if (
      namedTypes.FunctionDeclaration.check(functionAST.value) ||
      namedTypes.ArrowFunctionExpression.check(functionAST.value)
    ) {
      const functionBody = functionAST.value.body;

      if (namedTypes.BlockStatement.check(functionBody)) {
        functionBody.body.unshift(hook);
      } else {
        // If it's an arrow function with implicit return, wrap it in a block
        functionAST.value.body = j.blockStatement([
          hook,
          j.returnStatement(functionBody),
        ]);
      }
    }
  }
};

/**
 * Transformers
 */

/**
 * Transforms JSX text nodes into translation function calls
 * @param context - Transform context
 *
 * @example
 * // Input:
 * <div>Hello World</div>
 *
 * // Output:
 * <div>{t('component.hello-world')}</div>
 */
const transformJSXText = (context: TransformContext): void => {
  const { j, root, translations } = context;

  root
    .find(j.JSXText)
    .filter(
      (path) =>
        !CONSTANTS.TRANSLATION_BLACKLIST.includes(path.node.value.trim())
    )
    .forEach((path) => {
      const functionAST = getClosestFunctionAST(j, path);
      if (!functionAST) return;

      const componentName = _.lowerFirst(getFunctionName(j, functionAST));
      const value = sanitizeText(path.node.value);
      const key = createTranslationKey(value);

      // Add to translations object
      translations[componentName] = {
        ...translations[componentName],
        [key]: value,
      };

      // Ensure translation setup
      ensureTranslationImport(context);
      ensureTranslationHook(context, functionAST);

      // Replace text with translation call
      j(path).replaceWith(
        j.jsxExpressionContainer(
          j.callExpression(j.identifier('t'), [
            j.literal(`${componentName}.${key}`),
          ])
        )
      );
    });
};

/**
 * Transforms JSX attributes into translation function calls
 * @param context - Transform context
 *
 * @example
 * // Input:
 * <img alt="Profile picture" title="Click to edit" />
 *
 * // Output:
 * <img
 *   alt={t('component.profile-picture')}
 *   title={t('component.click-to-edit')}
 * />
 */
const transformJSXAttributes = (context: TransformContext): void => {
  const { j, root, translations } = context;

  root
    .find(j.JSXAttribute)
    .filter((path) => {
      if (!j.StringLiteral.check(path.value.value)) return false;

      const jsxAttribute = path.value.name.name;
      if (typeof jsxAttribute !== 'string') return false;

      const isTranslatableAttribute = (
        attr: string
      ): attr is TranslatableAttribute => {
        return CONSTANTS.JSX_ATTRIBUTES_TO_TRANSLATE.includes(
          attr as TranslatableAttribute
        );
      };

      return isTranslatableAttribute(jsxAttribute);
    })
    .forEach((path) => {
      if (!j.StringLiteral.check(path.value.value)) return;

      const functionAST = getClosestFunctionAST(j, path);
      if (!functionAST) return;

      const componentName = _.lowerFirst(getFunctionName(j, functionAST));
      const value = sanitizeText(path.value.value.value);
      const key = createTranslationKey(value);

      // Add to translations object
      translations[componentName] = {
        ...translations[componentName],
        [key]: value,
      };

      // Ensure translation setup
      ensureTranslationImport(context);
      ensureTranslationHook(context, functionAST);

      // Replace attribute with translation call
      j(path).replaceWith(
        j.jsxAttribute.from({
          name: path.value.name,
          value: j.jsxExpressionContainer(
            j.callExpression(j.identifier('t'), [
              j.literal(`${componentName}.${key}`),
            ])
          ),
        })
      );
    });
};

/**
 * Transforms template literals into translation function calls
 * Handles variables within template literals
 *
 * @param context - Transform context
 *
 * @example
 * // Input:
 * `Hello ${name}, you have ${count} messages`
 *
 * // Output:
 * t('component.hello-you-have-messages', { name, count })
 */
const transformTemplateLiterals = (context: TransformContext): void => {
  const { j, root, translations } = context;

  root
    .find(j.TemplateLiteral)
    .filter((path) => {
      // Skip template literals in blacklisted attributes
      if (
        j.JSXAttribute.check(path.parentPath.parentPath?.value) &&
        path.parentPath.parentPath?.value.name &&
        typeof path.parentPath.parentPath.value.name.name === 'string' &&
        CONSTANTS.TEMPLATE_LITERAL_BLACKLIST.includes(
          path.parentPath.parentPath.value.name.name
        )
      ) {
        return false;
      }

      // Skip tagged template literals
      if (path.parentPath.value.type === 'TaggedTemplateExpression') {
        return false;
      }

      return true;
    })
    .forEach((path) => {
      const functionAST = getClosestFunctionAST(j, path);
      if (!functionAST) return;

      const componentName = _.lowerFirst(getFunctionName(j, functionAST));

      let text = '';
      const expressionProperties: Array<namedTypes.ObjectProperty> = [];

      // Process each expression in the template literal
      let i = 0;
      for (; i < path.value.expressions.length; ++i) {
        const expression = path.value.expressions[i];
        let varName = '';

        // Get meaningful variable names
        if (expression.type === 'Identifier') {
          varName = expression.name;
        } else if (expression.type === 'MemberExpression') {
          const source = j(expression).toSource();
          varName = source.split('.').pop() || `var${i + 1}`;
        } else {
          varName = `var${i + 1}`;
        }

        text += `${path.value.quasis[i].value.cooked}{{${varName}}}`;

        // Create property for the variable
        expressionProperties.push(
          j.objectProperty.from({
            key: j.identifier(varName),
            value: expression,
            shorthand:
              expression.type === 'Identifier' && expression.name === varName,
            computed: false,
          })
        );
      }
      text += path.value.quasis[i].value.cooked;

      const value = sanitizeText(text);
      const key = createTranslationKey(value.replace(/\{\{.*?\}\}/g, ''));

      // Add to translations object
      translations[componentName] = {
        ...translations[componentName],
        [key]: value,
      };

      // Ensure translation setup
      ensureTranslationImport(context);
      ensureTranslationHook(context, functionAST);

      // Create translation call arguments
      const tArgs: Array<namedTypes.Literal | namedTypes.ObjectExpression> = [
        j.literal(`${componentName}.${key}`),
      ];

      if (expressionProperties.length > 0) {
        tArgs.push(j.objectExpression(expressionProperties));
      }

      // Replace template literal with translation call
      j(path).replaceWith(j.callExpression(j.identifier('t'), tArgs));
    });
};

/**
 * Main transform function
 * Entry point for the codemod
 */
const transform: Transform = (
  file: FileInfo,
  { jscodeshift: j }: API,
  options: Options
) => {
  const transformOptions = options as TransformOptions;
  const { translationFilePath, translationRoot, importName } = transformOptions;

  if (!translationFilePath || !importName) {
    throw new Error(
      'Missing required options: translationFilePath or importName'
    );
  }

  const translations = readTranslations(translationFilePath, translationRoot);
  const root = j(file.source);

  const context: TransformContext = {
    j,
    root,
    translations,
    importPackage: importName,
  };

  // Apply all transformations
  transformJSXText(context);
  transformJSXAttributes(context);
  transformTemplateLiterals(context);

  // Save translations
  writeTranslations(translationFilePath, translations, translationRoot);

  const translatedComponentsCount = Object.keys(translations).length;
  const totalTranslationsCount = Object.values(translations).reduce(
    (acc, curr) => acc + Object.keys(curr).length,
    0
  );

  console.log(`
    Translation Summary:
    - Components translated: ${translatedComponentsCount}
    - Total translations: ${totalTranslationsCount}
    - Translation file: ${translationFilePath}
    `);

  return root.toSource({ quote: 'single' });
};

export default transform;
export const parser = 'tsx';
