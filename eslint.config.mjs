// Flat ESLint config (ESLint 10). One config for the whole repository.
//
// TypeScript sources get type-aware linting via typescript-eslint's project
// service; plain JS/ESM (tooling scripts, config files) get the non-type-aware
// rules so they don't need to belong to a tsconfig.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

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
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^\\.{1,2}/.*\\.(?:js|jsx|mjs|cjs|ts|tsx|mts|cts)$',
              message: 'Product-package relative TypeScript imports must be extensionless.',
            },
          ],
        },
      ],
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

  // Storybook play functions and test doubles intentionally implement callback
  // contracts that may be async/no-op for only some scenarios.
  {
    files: [
      'packages/nevo-ui/**/*.stories.tsx',
      'packages/nevo-ui/**/*.test.{ts,tsx}',
      'tools/figma-import/**/*.test.ts',
    ],
    rules: {
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },

  // Playwright's page-evaluation boundary is intentionally dynamic; assertions
  // immediately validate the returned browser values.
  {
    files: ['tools/figma-import/ui.test.ts'],
    rules: {
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
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
      '@typescript-eslint/no-empty-object-type': [
        'error',
        { allowInterfaces: 'with-single-extends' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Keep the open-registry exception after shared rules so the deliberate
  // module-augmentation interfaces remain valid without weakening components.
  {
    files: [
      'packages/figma-core/src/metadata.tsx',
      'packages/nevo-ui/src/figma/captureRegistry.ts',
      'apps/specflow-ui/src/app/figmaRegistry.ts',
      'apps/specflow-ui/src/brand/nevo/figmaDesignSystem.ts',
      'examples/crm/src/figmaRegistry.ts',
      'tools/figma-project/src/project/captureRegistry.ts',
      'tools/figma-project/src/types.ts',
    ],
    rules: {
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
    },
  },

  // Formatting is Prettier's job — turn off any stylistic conflicts.
  prettier,
);
