import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Global ignores
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.turbo/**', '**/coverage/**'],
  },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript recommended rules
  ...tseslint.configs.recommended,

  // Prettier — disables conflicting rules (must be after other configs)
  eslintConfigPrettier,

  // Shared settings for all files
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'simple-import-sort/imports': [
        'error',
        {
          groups: [
            // Side-effect imports
            ['^\\u0000'],
            // Node builtins
            ['^node:(?!.*\\u0000$)'],
            // External packages (not @calley)
            ['^(?!@calley/)(?!.*\\u0000$)@?\\w'],
            // @calley packages
            ['^@calley/(?!.*\\u0000$)'],
            // Internal @/ aliases
            ['^@/(?!.*\\u0000$)'],
            // Relative imports
            ['^\\.(?!.*\\u0000$)'],
            // Type-only imports (last)
            ['^.+\\u0000$'],
          ],
        },
      ],
      'simple-import-sort/exports': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Node.js files (API, config files)
  {
    files: ['apps/api/**/*.ts', '*.config.{js,ts}', 'apps/web/vite.config.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // React files (Web app)
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react-hooks/incompatible-library': 'off',
    },
  },
);
