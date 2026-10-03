// Flat ESLint config (ESLint 10). One config for the whole repository.
//
// TypeScript sources get type-aware linting via typescript-eslint's project
// service; plain JS/ESM (tooling scripts, config files) get the non-type-aware
// rules so they don't need to belong to a tsconfig.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

const productRelativeImportPattern = {
  regex: '^\\.{1,2}/.*\\.(?:js|jsx|mjs|cjs|ts|tsx|mts|cts)$',
  message: 'Product-package relative TypeScript imports must be extensionless.',
};

function productImportRestrictions(...patterns) {
  return ['error', { patterns: [productRelativeImportPattern, ...patterns] }];
}

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/.output/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/.tsbuild/**',
      '**/node_modules/**',
      '**/*.generated.*',
      'docs/**/*.generated.*',
      '.local/**',
    ],
  },

  js.configs.recommended,

  // TypeScript — type-aware.
  {
    files: ['**/*.{ts,mts,cts,tsx}'],
    extends: [tseslint.configs.recommendedTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Product packages use extensionless relative TypeScript source imports.
  {
    files: ['packages/**/*.{ts,tsx,mts,cts}'],
    rules: {
      'no-restricted-imports': productImportRestrictions(),
    },
  },

  // Product package direction is intentionally one-way. These rules protect the
  // durable package topology documented in ADR 0012; the composition root is the
  // only layer allowed to depend on every product capability.
  {
    files: [
      'packages/authorization/**/*.{ts,tsx,mts,cts}',
      'packages/http-client/**/*.{ts,tsx,mts,cts}',
    ],
    rules: {
      'no-restricted-imports': productImportRestrictions({
        regex: '^@nevo/specflow(?:-|/|$)',
        message: 'Product-neutral foundation packages must not depend on SpecFlow product packages.',
      }),
    },
  },
  {
    files: ['packages/specflow-contracts/**/*.{ts,tsx,mts,cts}'],
    rules: {
      'no-restricted-imports': productImportRestrictions({
        regex: '^@nevo/(?:specflow|specflow-runtime|specflow-ui)(?:/|$)',
        message: 'Shared SpecFlow contracts must not depend on the product shell, Runtime, or UI.',
      }),
    },
  },
  {
    files: ['packages/specflow-runtime/**/*.{ts,tsx,mts,cts}'],
    rules: {
      'no-restricted-imports': productImportRestrictions({
        regex: '^@nevo/(?:specflow|specflow-ui)(?:/|$)',
        message: 'Runtime must not depend on the product composition root or UI.',
      }),
    },
  },
  {
    files: ['packages/specflow-ui/**/*.{ts,tsx,mts,cts}'],
    rules: {
      'no-restricted-imports': productImportRestrictions({
        regex: '^@nevo/(?:authorization|specflow|specflow-runtime)(?:/|$)',
        message:
          'SpecFlow UI consumes shared contracts and client boundaries; it must not depend on Runtime, the product shell, or authorization policy implementation.',
      }),
    },
  },

  // Package-owned build scripts execute directly through Node's native TypeScript
  // support, so their relative module specifiers use explicit .ts extensions.
  {
    files: ['packages/specflow/packaging/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },

  // Plain JS / ESM — no type-aware rules, no tsconfig membership required.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.recommended, tseslint.configs.disableTypeChecked],
  },

  // Node globals are explicit. Neutral product packages intentionally do not
  // inherit process/Buffer/etc. merely because @types/node exists in the workspace.
  {
    files: [
      'tools/**/*.{ts,mts,cts,tsx,js,mjs,cjs}',
      'packages/specflow/**/*.{ts,mts,cts,tsx,js,mjs,cjs}',
      'packages/specflow-runtime/**/*.{ts,mts,cts,tsx,js,mjs,cjs}',
      '*.{js,mjs,cjs,ts,mts,cts}',
      '*.config.{js,mjs,cjs,ts,mts,cts}',
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Shared language options + rules across both.
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Formatting is Prettier's job — turn off any stylistic conflicts.
  prettier,
);
