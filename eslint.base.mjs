// Shared ESLint (flat config, ESLint 10) building blocks for the whole repository.
//
// Linting is split per workspace package: every package (packages/*, tools/*, examples/*) owns an
// `eslint.config.mjs` that composes `packageConfig()` from here with the fragments under
// `tools/eslint/`, and a `lint` script (`eslint .`) that Turborepo runs and caches per package.
// The root `eslint.config.mjs` covers only the files that belong to no package.
//
// TypeScript sources get type-aware linting through typescript-eslint's project service, scoped to
// the package (`tsconfigRootDir`), so one run never builds a program over other packages' sources.
// Plain JS/ESM (tooling scripts, config files) get the non-type-aware rules so they do not need to
// belong to a tsconfig.
//
// Block order is significant (later blocks win per rule); `packageConfig` keeps the order the
// repository has always used: ignores, JS recommended, typed TS, product import rules, package
// boundaries, plain JS, overrides, Node globals, shared rules, registry exceptions, Prettier.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import { productRelativeImports } from './tools/eslint/imports.mjs';

export const generatedAndBuildIgnores = [
  '**/dist/**',
  '**/build/**',
  '**/.output/**',
  '**/coverage/**',
  '**/.turbo/**',
  '**/.tsbuild/**',
  '**/node_modules/**',
  '**/*.generated.*',
  // Transient directory that tools/build-package.mjs creates in the package root while a build runs;
  // lint does not wait for the package's own build, so it must not traverse it.
  '**/.nevo-package-surface-*/**',
];

const typedTypeScriptFiles = ['**/*.{ts,mts,cts,tsx}'];
const nodeSourceFiles = ['**/*.{ts,mts,cts,tsx,js,mjs,cjs}'];

/**
 * Type-aware parser options for TypeScript files that live outside the package's main tsconfig
 * (tests, stories, tooling): they name an explicit project instead of the project service.
 */
export function explicitProject(files, project, tsconfigRootDir) {
  return {
    files,
    languageOptions: {
      parserOptions: { projectService: false, project: [project], tsconfigRootDir },
    },
  };
}

/**
 * @param {object} options
 * @param {string} options.tsconfigRootDir  The package directory (`import.meta.dirname`).
 * @param {boolean} [options.product]       Product package: extensionless relative TS imports.
 * @param {boolean} [options.node]          Node globals (tools and Node-powered packages).
 * @param {boolean} [options.typed]         Type-aware linting for TS files (default true).
 * @param {string[]} [options.extraIgnores] Additional ignore globs (relative to the package).
 * @param {object[]} [options.projects]     Explicit-project blocks, see `explicitProject`.
 * @param {object[]} [options.boundaries]   Package direction / ownership / UI rule blocks.
 * @param {object[]} [options.overrides]    Rule relaxations for tests, stories, tooling.
 * @param {string[]} [options.registryFiles] Open-registry files (module augmentation interfaces).
 */
export function packageConfig({
  tsconfigRootDir,
  product = false,
  node = false,
  typed = true,
  extraIgnores = [],
  projects = [],
  boundaries = [],
  overrides = [],
  registryFiles = [],
}) {
  return tseslint.config(
    { ignores: [...generatedAndBuildIgnores, ...extraIgnores] },

    js.configs.recommended,

    // TypeScript — type-aware.
    ...(typed
      ? [
          {
            files: typedTypeScriptFiles,
            extends: [
              tseslint.configs.recommendedTypeChecked,
              tseslint.configs.stylisticTypeChecked,
            ],
            languageOptions: { parserOptions: { projectService: true, tsconfigRootDir } },
          },
        ]
      : []),
    ...projects,

    ...(product ? [productRelativeImports] : []),
    ...boundaries,

    // Plain JS / ESM — no type-aware rules, no tsconfig membership required.
    {
      files: ['**/*.{js,mjs,cjs}'],
      extends: [tseslint.configs.recommended, tseslint.configs.disableTypeChecked],
    },

    ...overrides,

    // Node globals are explicit. Neutral product packages intentionally do not inherit
    // process/Buffer/etc. merely because @types/node exists in the workspace.
    ...(node
      ? [{ files: nodeSourceFiles, languageOptions: { globals: { ...globals.node } } }]
      : []),

    // Shared language options + rules across both.
    {
      plugins: {
        '@typescript-eslint': tseslint.plugin,
      },
      languageOptions: { ecmaVersion: 2024, sourceType: 'module' },
      rules: {
        'no-console': 'off',
        eqeqeq: ['error', 'always', { null: 'ignore' }],
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

    // Keep the open-registry exception after shared rules so the deliberate module-augmentation
    // interfaces remain valid without weakening components.
    ...(registryFiles.length > 0
      ? [
          {
            files: registryFiles,
            rules: {
              '@typescript-eslint/no-empty-object-type': 'off',
              '@typescript-eslint/no-redundant-type-constituents': 'off',
            },
          },
        ]
      : []),

    // Formatting is Prettier's job — turn off any stylistic conflicts.
    prettier,

    // Structural readability is not handled by Prettier. Keep these rules AFTER
    // eslint-config-prettier; they enforce braces and separate logical statements.
    {
      rules: {
        curly: ['error', 'all'],
        'padding-line-between-statements': [
          'error',
          { blankLine: 'always', prev: 'directive', next: '*' },
          { blankLine: 'any', prev: 'directive', next: 'directive' },
          { blankLine: 'always', prev: 'block-like', next: '*' },
          { blankLine: 'always', prev: '*', next: ['return', 'throw'] },
        ],
      },
    },
  );
}
