# jscodeshift-react-i18next

jscodeshift transform that aims to extract hardocded strings in the React application. It intends to work with `react-i18next` and `next-i18next` but it'll be fairly easily adjustable to other needs.

## Usage

There's a few options available

- `translationFilePath` - specifies a file that will be used to store extracted translations
- `translationRoot` - wraps all the translations in `translationFilePath` with root element specified here, for example if you provide `common` here as a value the translation file will look like this
  
  ```json
  {
    "common": {
      "testComponent": {
        ...
      }
    }
  }
  ```

- `importName` - this speficies what package will be imported when translation is added, for example if you specify `react-i18next` the `import { useTranslation } from 'react-i18next';` will be added the imports.

Example usage

1. Install deps by running `yarn install`

2. Run the transform

```
jscodeshift --extensions=tsx --parser=tsx --run-in-band -t ./extract-translations-transform.ts ./example --translationFilePath=./translations.json --translationRoot=translation --importName=react-i18next
```

Before

```typescript
import React from "react";

const v1 = "v1content";
const v2 = "v2content";

export const TestComponent = () => {
  return (
    <div
      className={`This should NOT be translated`}
      title={`This SHOULD be translated`}
    >
      This text should be translated too
      <span>{`This template string text should be translated too, ${v1}, and ${v2} and that's it.`}</span>
    </div>
  );
};

```

After

```typescript
import { useTranslation } from "react-i18next";
import React from "react";

const v1 = "v1content";
const v2 = "v2content";

export const TestComponent = () => {
  const { t } = useTranslation();

  return (
    <div
      className={`This should NOT be translated`}
      title={t("testComponent.this-should-be-translated", {})}
    >
      {t("testComponent.this-text-should-be-translated-too")}
      <span>
        {t("testComponent.this-template-string-text-should-be-tran", {
          v1,
          v2,
        })}
      </span>
    </div>
  );
};
```

```json
{
  "translation": {
    "testComponent": {
      "this-should-be-translated": "This SHOULD be translated",
      "this-template-string-text-should-be-tran": "This template string text should be translated too, {{v1}}, and {{v2}} and that's it.",
      "this-text-should-be-translated-too": "This text should be translated too"
    }
  }
}
```

## TODO

- [ ] handle cases where the translation is added for things related to `TailwindCSS` (it should work for most of the cases, but there are some edge cases)
- [ ] add support for using `<Trans />` component when there are react component used within a text to translate
- [ ] check if there's a better way of limiting the translation scope instead of using whitelists for `JSXAttributes`

## Credits
- [@Dschoordsch](https://github.com/Dschoordsch) for giving an idea [here](https://github.com/ParabolInc/parabol/pull/7155/files#diff-3301ada7ba726aadaa1866e63db8220359271fa6910dfee14e653ea83f7d839c)
- [ast-i18n](https://github.com/sibelius/ast-i18n) for showcasing other way of doing it

## Links
- [https://react.i18next.com/](https://react.i18next.com/)
- [https://next.i18next.com](https://next.i18next.com)
