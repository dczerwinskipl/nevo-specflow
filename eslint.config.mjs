// Flat ESLint config (ESLint 10). One config for the whole repository.
//
// TypeScript sources get type-aware linting via typescript-eslint's project
// service; plain JS/ESM (tooling scripts, config files) get the non-type-aware
// rules so they don't need to belong to a tsconfig.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import i18nCopy from './tools/eslint/no-hardcoded-copy.mjs';

const productRelativeImportPattern = {
  regex: '^\\.{1,2}/.*\\.(?:js|jsx|mjs|cjs|ts|tsx|mts|cts)$',
  message: 'Product-package relative TypeScript imports must be extensionless.',
};

function productImportRestrictions(...patterns) {
  return ['error', { patterns: [productRelativeImportPattern, ...patterns] }];
}

const specflowUiSharedPatterns = [
  {
    regex: '^@nevo/(?:authorization|specflow|specflow-engine|specflow-runtime)(?:/|$)',
    message:
      'SpecFlow UI consumes shared contracts and client boundaries; it must not depend on Runtime, the product shell, or authorization policy implementation.',
  },
];
const nonProductionUiSources = [
  'packages/specflow-ui/src/**/*.{test,stories}.{ts,tsx}',
  'packages/specflow-ui/src/**/*.stories-support.{ts,tsx}',
  'packages/specflow-ui/src/**/*.test-support.{ts,tsx}',
];

// Other features are reached through their barrel only: `../specs` is fine, `../specs/queries` is not.
function featureBarrelPattern(others) {
  return {
    regex: String.raw`^(?:\.\./)+(?:${others.join('|')})/.`,
    message:
      'Import another feature through its public barrel (features/<name>/index.ts), not its internals. A capability belongs to the module that owns it; if the barrel lacks it, the owner exports it deliberately.',
  };
}

function specflowUiBoundaryBlocks() {
  const features = ['documents', 'sessions', 'specs', 'tasks', 'git'];
  const blocks = features.map((feature) => {
    const patterns = [
      ...specflowUiSharedPatterns,
      featureBarrelPattern(features.filter((other) => other !== feature)),
    ];
    return {
      files: [`packages/specflow-ui/src/features/${feature}/**/*.{ts,tsx}`],
      ignores: nonProductionUiSources,
      rules: { 'no-restricted-imports': productImportRestrictions(...patterns) },
    };
  });
  // Specification creation is internal to specs/creation: the rest of specs reaches it only via its
  // entry (`./creation`), never `./creation/<internal>`.
  blocks.push({
    files: ['packages/specflow-ui/src/features/specs/**/*.{ts,tsx}'],
    ignores: [...nonProductionUiSources, 'packages/specflow-ui/src/features/specs/creation/**'],
    rules: {
      'no-restricted-imports': productImportRestrictions(
        ...specflowUiSharedPatterns,
        featureBarrelPattern(features.filter((other) => other !== 'specs')),
        {
          regex: '(?:^|/)creation/.',
          message:
            'Specification creation internals are private to features/specs/creation; use its entry (features/specs/creation).',
        },
      ),
    },
  });
  // shared/ is cross-feature code: it depends on no feature and on no composition root.
  blocks.push({
    files: ['packages/specflow-ui/src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': productImportRestrictions(...specflowUiSharedPatterns, {
        regex: String.raw`^(?:\.\./)+(?:features|app|services)(?:/|$)`,
        message:
          'shared/ holds only cross-feature code and must not import features or the composition roots.',
      }),
    },
  });
  return blocks;
}

// Runtime module ownership mirrors the UI rule: a capability lives in the feature that owns it and
// features reach each other only through the public barrel (`features/<name>/index.ts`). The demo
// environment composition root (`src/demo/index`) is wired only by the server; features may use the
// shared demo state, catalogue and HTTP helpers (`src/demo/state`, `catalogue`, `http`).
const runtimeSharedPatterns = [
  {
    regex: '^@nevo/(?:specflow|specflow-ui)(?:/|$)',
    message: 'Runtime must not depend on the product composition root or UI.',
  },
  {
    regex: '^@nevo/specflow-engine/testing(?:/|$)',
    message: 'Production Runtime must use Engine application APIs, not the testing backdoor.',
  },
];
const runtimeFeatures = ['auth', 'documents', 'sessions', 'settings', 'specs', 'tasks'];
function runtimeBoundaryBlocks() {
  const nonProduction = ['packages/specflow-runtime/src/**/*.test.ts'];
  return runtimeFeatures.map((feature) => ({
    files: [`packages/specflow-runtime/src/features/${feature}/**/*.ts`],
    ignores: nonProduction,
    rules: {
      'no-restricted-imports': productImportRestrictions(
        ...runtimeSharedPatterns,
        {
          regex: String.raw`^(?:\.\./)+(?:${runtimeFeatures.filter((other) => other !== feature).join('|')})/.`,
          message:
            'Import another Runtime feature through its public barrel (features/<name>/index.ts), not its internals. The owning feature exports what others may use.',
        },
        {
          regex: String.raw`^(?:\.\./)+demo(?:/index)?$`,
          message:
            'The demo composition root (src/demo) wires features together; features import only src/demo/state, catalogue or http.',
        },
      ),
    },
  }));
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
      '.artifacts/**',
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

  // Neutral production projects intentionally exclude Node-powered tests and
  // package tooling. Point ESLint at their dedicated TypeScript projects.
  {
    files: ['packages/nevo-ui/**/*.test.{ts,tsx}', 'packages/nevo-ui/**/*.stories.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: ['./packages/nevo-ui/tsconfig.test.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['packages/nevo-ui/scripts/**/*.{ts,mts}', 'packages/nevo-ui/vite.config.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: ['./packages/nevo-ui/tsconfig.tools.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['packages/figma-core/**/*.test.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: ['./packages/figma-core/tsconfig.test.json'],
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

  // Reusable UI/Figma foundations follow the same one-way dependency rule as
  // the product capabilities below. Keep these restrictions next to the
  // generic package rule so new source files inherit them automatically.
  {
    files: ['packages/figma-core/**/*.{ts,tsx,mts,cts}'],
    rules: {
      'no-restricted-imports': productImportRestrictions({
        regex: '^(?:react(?:-dom)?(?:/|$)|@nevo/(?:figma-capture|ui|specflow)(?:-|/|$))',
        message:
          'Figma core is neutral authoring/IR infrastructure and must not depend on React, capture runtime, concrete UI, or SpecFlow product packages.',
      }),
    },
  },
  {
    files: ['packages/figma-capture/**/*.{ts,tsx,mts,cts}'],
    rules: {
      'no-restricted-imports': productImportRestrictions(
        {
          regex: '^@nevo/(?!figma-core(?:/|$))',
          message:
            'Figma capture may depend on neutral Figma core, but not on product or concrete UI packages.',
        },
        {
          regex: '^react-dom(?:/|$)',
          message: 'Figma capture uses React context only and must not depend on a DOM renderer.',
        },
      ),
    },
  },
  {
    files: ['packages/nevo-ui/**/*.{ts,tsx,mts,cts}'],
    rules: {
      'no-restricted-imports': productImportRestrictions({
        regex: '^@nevo/specflow(?:-|/|$)',
        message: 'Reusable Nevo UI must not depend on any SpecFlow product package.',
      }),
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
        message:
          'Product-neutral foundation packages must not depend on SpecFlow product packages.',
      }),
    },
  },
  {
    files: ['packages/specflow-contracts/**/*.{ts,tsx,mts,cts}'],
    rules: {
      'no-restricted-imports': productImportRestrictions({
        regex: '^@nevo/(?:specflow|specflow-engine|specflow-runtime|specflow-ui)(?:/|$)',
        message: 'Shared SpecFlow contracts must not depend on the product shell, Runtime, or UI.',
      }),
    },
  },
  {
    files: ['packages/specflow-engine/**/*.{ts,tsx,mts,cts}'],
    rules: {
      'no-restricted-imports': productImportRestrictions({
        regex:
          '^(?:@nevo/specflow(?!-contracts(?:/|$))(?:-|/|$)|@fastify(?:/|$)|fastify(?:/|$)|commander(?:/|$)|react(?:-dom)?(?:/|$)|openid-client(?:/|$))',
        message: 'Engine is independent of CLI, Runtime, providers, HTTP, and UI adapters.',
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
    files: ['packages/specflow-runtime/src/**/*.{ts,tsx,mts,cts}'],
    rules: {
      'no-restricted-imports': productImportRestrictions(
        {
          regex: '^@nevo/(?:specflow|specflow-ui)(?:/|$)',
          message: 'Runtime must not depend on the product composition root or UI.',
        },
        {
          regex: '^@nevo/specflow-engine/testing(?:/|$)',
          message: 'Production Runtime must use Engine application APIs, not the testing backdoor.',
        },
      ),
    },
  },
  ...runtimeBoundaryBlocks(),
  {
    files: ['packages/specflow/src/**/*.{ts,tsx,mts,cts}'],
    rules: {
      'no-restricted-imports': productImportRestrictions({
        regex: '^@nevo/specflow-engine/testing(?:/|$)',
        message: 'Production CLI must use Engine application APIs, not the testing backdoor.',
      }),
    },
  },
  {
    files: ['packages/specflow-ui/**/*.{ts,tsx,mts,cts}'],
    rules: {
      'no-restricted-imports': productImportRestrictions({
        regex: '^@nevo/(?:authorization|specflow|specflow-engine|specflow-runtime)(?:/|$)',
        message:
          'SpecFlow UI consumes shared contracts and client boundaries; it must not depend on Runtime, the product shell, or authorization policy implementation.',
      }),
    },
  },

  // SpecFlow UI module ownership: a component lives in the module that owns the capability and
  // features talk to each other only through their public barrel (`features/<name>/index.ts`).
  // Composition roots (`app/`, `services/`) and tests/stories/story-support are not restricted.
  // A file matched here replaces the generic package rule above, so the shared patterns repeat.
  ...specflowUiBoundaryBlocks(),

  // Reader-facing copy in SpecFlow UI components comes from the i18n catalogue
  // (`packages/specflow-ui/src/i18n/locales`). See docs: frontend localization.
  {
    files: ['packages/specflow-ui/src/**/*.tsx'],
    ignores: [
      'packages/specflow-ui/src/**/*.{test,stories}.tsx',
      'packages/specflow-ui/src/**/*.figma.tsx',
      'packages/specflow-ui/src/**/*.stories-support.tsx',
      'packages/specflow-ui/src/test-support/**',
    ],
    plugins: { 'specflow-i18n': i18nCopy },
    rules: { 'specflow-i18n/no-hardcoded-copy': 'error' },
  },

  // Static React Hooks checks for product and design-system UI sources. Rules of Hooks is a hard
  // gate; Exhaustive Deps is analysed per finding (separate synchronisation from operation logic)
  // rather than fixed by blindly adding dependencies.
  {
    files: ['packages/specflow-ui/src/**/*.{ts,tsx}', 'packages/nevo-ui/src/**/*.{ts,tsx}'],
    ignores: [
      'packages/*/src/**/*.{test,stories}.{ts,tsx}',
      'packages/*/src/**/*.stories-support.{ts,tsx}',
      'packages/*/src/**/*.test-support.{ts,tsx}',
      'packages/specflow-ui/src/test-support/**',
    ],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
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
      'packages/specflow-engine/**/*.{ts,mts,cts,tsx,js,mjs,cjs}',
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
      'packages/figma-core/src/metadata.ts',
      'packages/nevo-ui/src/figma/captureRegistry.ts',
      'packages/specflow-ui/src/app/figmaRegistry.ts',
      'packages/specflow-ui/src/brand/nevo/figmaDesignSystem.ts',
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
