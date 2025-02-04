# React i18n Codemod

A jscodeshift transform that automatically extracts hardcoded strings from React components and wraps them in translation hooks. This tool helps automate the internationalization process of React applications.

## Features

- ✨ Extracts text from JSX elements
- 🔤 Handles translatable attributes (alt, title, aria-label, etc.)
- 📝 Supports template literals with variables
- 🔑 Automatically generates translation keys
- 💾 Updates translation JSON files
- 🔄 Adds necessary imports and hooks
- 📦 TypeScript support

## Installation

```bash
npm install -g jscodeshift
npm install --save-dev @types/jscodeshift
```

## Usage

```bash
npx jscodeshift -t transform.ts src/**/*.tsx --parser=tsx \
  --translationFilePath=./translations.json \
  --importName=react-i18next
```

before

```tsx
import React from 'react';

interface User {
  name: string;
  role: string;
  notifications: number;
}

const user: User = {
  name: 'John Doe',
  role: 'Admin',
  notifications: 5
};

const formatDate = (date: Date) => date.toLocaleDateString();
const currentDate = new Date();

export const TestComponent: React.FC = () => {
  return (
    <div>
      {/* Simple text translation */}
      <h1>Welcome to Our Platform</h1>
      <p>Please read the instructions carefully</p>

      {/* Translatable attributes */}
      <img 
        src="/profile.jpg"
        alt="User profile picture" 
        title="Click to edit your profile picture"
      />
      
      <input
        type="text"
        placeholder="Enter your username"
        title="Username must be at least 3 characters"
        aria-label="Username input field"
      />

      {/* Template literals with variables */}
      <div aria-description="User information section">
        {`Hello ${user.name}, you are logged in as ${user.role}`}
      </div>

      {/* Multiple variables and nested properties */}
      <div aria-label="Notification count">
        {`You have ${user.notifications} new notifications as of ${formatDate(currentDate)}`}
      </div>

      {/* Mixed content */}
      <section>
        <h2>Account Overview</h2>
        <p>{`Last login: ${formatDate(currentDate)}`}</p>
        <div aria-description="Account status indicator">
          Account Status: Active
        </div>
      </section>

      {/* Complex template literals */}
      <p aria-label="Subscription status">
        {`Your subscription ${user.notifications > 0 ? 'requires' : 'does not require'} attention`}
      </p>

      {/* Multiple elements with translatable content */}
      <footer>
        <p>Thank you for using our service</p>
        <a 
          href="/support"
          title="Get help from our support team"
          aria-label="Contact support"
        >
          Need help? Contact support
        </a>
        <div>{`© ${new Date().getFullYear()} All rights reserved`}</div>
      </footer>
    </div>
  );
};
```

after

```tsx
import { useTranslation } from 'react-i18next';
import React from 'react';

interface User {
  name: string;
  role: string;
  notifications: number;
}

const user: User = {
  name: 'John Doe',
  role: 'Admin',
  notifications: 5
};

const formatDate = (date: Date) => date.toLocaleDateString();
const currentDate = new Date();

export const TestComponent: React.FC = () => {
  const {
    t
  } = useTranslation();

  return (
    (<div>
      {/* Simple text translation */}
      <h1>{t('testComponent.welcome-to-our-platform')}</h1>
      <p>{t('testComponent.please-read-the-instructions-carefully')}</p>
      {/* Translatable attributes */}
      <img 
        src="/profile.jpg"
        alt={t('testComponent.user-profile-picture')} 
        title={t('testComponent.click-to-edit-your-profile-picture')}
      />
      <input
        type="text"
        placeholder="Enter your username"
        title={t('testComponent.username-must-be-at-least-3-characters')}
        aria-label={t('testComponent.username-input-field')}
      />
      {/* Template literals with variables */}
      <div aria-description="User information section">
        {t('testComponent.hello-you-are-logged-in-as', {
          name: user.name,
          role: user.role
        })}
      </div>
      {/* Multiple variables and nested properties */}
      <div aria-label={t('testComponent.notification-count')}>
        {t('testComponent.you-have-new-notifications-as-of', {
          notifications: user.notifications,
          var2: formatDate(currentDate)
        })}
      </div>
      {/* Mixed content */}
      <section>
        <h2>{t('testComponent.account-overview')}</h2>
        <p>{t('testComponent.last-login', {
          var1: formatDate(currentDate)
        })}</p>
        <div aria-description="Account status indicator">{t('testComponent.account-status-active')}</div>
      </section>
      {/* Complex template literals */}
      <p aria-label={t('testComponent.subscription-status')}>
        {t('testComponent.your-subscription-attention', {
          var1: user.notifications > 0 ? 'requires' : 'does not require'
        })}
      </p>
      {/* Multiple elements with translatable content */}
      <footer>
        <p>{t('testComponent.thank-you-for-using-our-service')}</p>
        <a 
          href="/support"
          title={t('testComponent.get-help-from-our-support-team')}
          aria-label={t('testComponent.contact-support')}
        >{t('testComponent.need-help-contact-support')}</a>
        <div>{t('testComponent.c-all-rights-reserved', {
          var1: new Date().getFullYear()
        })}</div>
      </footer>
    </div>)
  );
};
```

and translation file created

```json
{
  "testComponent": {
    "account-overview": "Account Overview",
    "account-status-active": "Account Status: Active",
    "c-all-rights-reserved": "© {{var1}} All rights reserved",
    "click-to-edit-your-profile-picture": "Click to edit your profile picture",
    "contact-support": "Contact support",
    "get-help-from-our-support-team": "Get help from our support team",
    "hello-you-are-logged-in-as": "Hello {{name}}, you are logged in as {{role}}",
    "last-login": "Last login: {{var1}}",
    "need-help-contact-support": "Need help? Contact support",
    "notification-count": "Notification count",
    "please-read-the-instructions-carefully": "Please read the instructions carefully",
    "subscription-status": "Subscription status",
    "thank-you-for-using-our-service": "Thank you for using our service",
    "this-should-be-translated": "This SHOULD be translated",
    "this-template-string-text-should-be-tran": "This template string text should be translated too, {{v1}}, and {{v2}} and that's it.",
    "this-text-should-be-translated-too": "This text should be translated too",
    "user-profile-picture": "User profile picture",
    "username-input-field": "Username input field",
    "username-must-be-at-least-3-characters": "Username must be at least 3 characters",
    "welcome-to-our-platform": "Welcome to Our Platform",
    "you-have-new-notifications-as-of": "You have {{notifications}} new notifications as of {{var2}}",
    "your-subscription-attention": "Your subscription {{var1}} attention"
  }
}
```

### Options

- `translationFilePath` (required): Path to your translations JSON file
- `translationRoot` (optional): Root key in translations file (e.g., 'en' or 'translations')
- `importName` (required): Translation package to import (e.g., 'react-i18next', 'next-i18next')

## Examples

### Basic Text Translation

Input:

```tsx
function Welcome() {
  return <div>Hello World</div>;
}
```

Output:

```tsx
import { useTranslation } from 'react-i18next';

function Welcome() {
  const { t } = useTranslation();
  return <div>{t('welcome.hello-world')}</div>;
}
```

### Attribute Translation

Input:

```tsx
function Profile() {
  return (
    <img 
      alt="User profile picture" 
      title="Click to edit profile"
      aria-label="Profile image"
    />
  );
}
```

Output:

```tsx
import { useTranslation } from 'react-i18next';

function Profile() {
  const { t } = useTranslation();
  return (
    <img 
      alt={t('profile.user-profile-picture')}
      title={t('profile.click-to-edit-profile')}
      aria-label={t('profile.profile-image')}
    />
  );
}
```

### Template Literals with Variables

Input:

```tsx
function Greeting({ name, count }) {
  return (
    <div>{`Welcome back, ${name}! You have ${count} notifications`}</div>
  );
}
```

Output:

```tsx
import { useTranslation } from 'react-i18next';

function Greeting({ name, count }) {
  const { t } = useTranslation();
  return (
    <div>
      {t('greeting.welcome-back-you-have-notifications', { 
        name, 
        count 
      })}
    </div>
  );
}
```

## Configuration

### Translatable Attributes

The following JSX attributes are processed for translation:

- `alt`
- `title`
- `placeholder`
- `aria-label`
- `aria-description`

You can modify the `JSX_ATTRIBUTES_TO_TRANSLATE` constant in the code to add more attributes.

### Blacklisted Template Literals

Some template literal attributes are blacklisted from translation:

- `className`
- `href`
- `src`
- `key`

### Translation Key Generation

Translation keys are automatically generated based on:

- Text content is slugified (converted to kebab-case)
- Special characters are removed
- Maximum length is 40 characters (configurable)
- Keys are prefixed with the component name in lowercase

## Best Practices

### 1. Review Generated Translations

Always review the generated translation keys and values for accuracy. The codemod makes intelligent guesses but might need adjustments.

### 2. Backup Your Code

Make sure to commit your changes before running the codemod:

```bash
git add .
git commit -m "pre-translation-codemod"
```

### 3. Run in Steps

For large codebases, consider running the transformation in smaller batches:

```bash
# Transform one component at a time
jscodeshift -t transform.ts src/components/Header.tsx \
  --parser=tsx \
  --translationFilePath=./translations.json \
  --importName=react-i18next
```

### 4. Handle Special Cases

Some texts might need manual attention:

- Complex template literals with conditional expressions
- Dynamic content with function calls
- Special formatting requirements
- Pluralization cases

## Common Issues and Solutions

### 1. Long Translation Keys

Problem: Keys are too long or unclear
Solution: Adjust `TRANSLATION_KEY_MAX_LENGTH` in constants or manually rename keys

### 2. Missing Translations

Problem: Some text isn't being translated
Solution: Check if the text matches any `TRANSLATION_BLACKLIST` entries

### 3. Variable Names

Problem: Template literal variables have unclear names
Solution: Use meaningful variable names in your components

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT

## Credits

- Built with [jscodeshift](https://github.com/facebook/jscodeshift)
- [@Dschoordsch](https://github.com/Dschoordsch) for giving an idea [here](https://github.com/ParabolInc/parabol/pull/7155/files#diff-3301ada7ba726aadaa1866e63db8220359271fa6910dfee14e653ea83f7d839c)
- [ast-i18n](https://github.com/sibelius/ast-i18n) for showcasing other way of doing it

## Links

- [https://react.i18next.com/](https://react.i18next.com/)
- [https://next.i18next.com](https://next.i18next.com)
