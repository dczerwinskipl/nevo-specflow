// SpecFlow UI rules: package direction, module ownership, localized copy.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import reactHooks from 'eslint-plugin-react-hooks';
import i18nCopy from './no-hardcoded-copy.mjs';
import productIconRule from './no-direct-product-icon.mjs';
import { restrict } from './imports.mjs';

const specflowUiSharedPatterns = [
  {
    regex: '^@nevo/(?:authorization|specflow|specflow-engine|specflow-runtime)(?:/|$)',
    message:
      'SpecFlow UI consumes shared contracts and client boundaries; it must not depend on Runtime, the product shell, or authorization policy implementation.',
  },
  {
    regex: '^@nevo/(?:specflow-docs|ai-semantic-search)(?:/|$)',
    message:
      'The documentation capability and the semantic search engine are Node-only; SpecFlow UI reaches documentation search through the Runtime HTTP API.',
  },
];
const nonProductionUiSources = [
  'src/**/*.{test,stories}.{ts,tsx}',
  'src/**/*.stories-support.{ts,tsx}',
  'src/**/*.test-support.{ts,tsx}',
];

// Other features are reached through their barrel only: `../specs` is fine, `../specs/queries` is not.
// Two more entries are public: `<feature>/read-model` (data other features may depend on; a leaf that
// imports only other read models) and `<feature>/routes` (route objects, for composition files).
function featureBarrelPattern(others) {
  return {
    regex: String.raw`^(?:\.\./)+(?:${others.join('|')})/(?!(?:read-model|routes)$).`,
    message:
      'Import another feature through its public barrel (features/<name>/index.ts) or its read-model entry, not its internals. A capability belongs to the module that owns it; if the barrel lacks it, the owner exports it deliberately.',
  };
}

function boundaryBlocks() {
  const features = ['docs', 'documents', 'sessions', 'specs', 'tasks', 'git', 'workspaces'];
  const blocks = features.map((feature) => {
    const patterns = [
      ...specflowUiSharedPatterns,
      featureBarrelPattern(features.filter((other) => other !== feature)),
    ];

    return restrict(patterns, [`src/features/${feature}/**/*.{ts,tsx}`], nonProductionUiSources);
  });
  // Specification creation is internal to specs/creation: the rest of specs does not import it; the
  // application wires only its routes (`creation/routes`).
  blocks.push(
    restrict(
      [
        ...specflowUiSharedPatterns,
        featureBarrelPattern(features.filter((other) => other !== 'specs')),
        {
          regex: '(?:^|/)creation(?:/|$)',
          message:
            'Specification creation is private to features/specs/creation; the application wires its routes (creation/routes).',
        },
      ],
      ['src/features/specs/**/*.{ts,tsx}'],
      [...nonProductionUiSources, 'src/features/specs/creation/**'],
    ),
  );
  // A read-model entry is a leaf: it may use other features' read models, never their screens
  // (barrels), so features that only need data stay out of each other's UI. The import-cycle test
  // checks the resulting graph.
  blocks.push(
    restrict(
      [
        ...specflowUiSharedPatterns,
        {
          regex: String.raw`^(?:\.\./)+(?:${features.join('|')})(?:/(?!read-model$).*)?$`,
          message:
            'A read-model entry is a leaf: import only other features read-model entries (features/<name>/read-model), never their barrel or internals.',
        },
      ],
      features.map((feature) => `src/features/${feature}/read-model/**/*.{ts,tsx}`),
      nonProductionUiSources,
    ),
  );
  // shared/ is cross-feature code: it depends on no feature and on no composition root.
  blocks.push(
    restrict(
      [
        ...specflowUiSharedPatterns,
        {
          regex: String.raw`^(?:\.\./)+(?:features|app|services)(?:/|$)`,
          message:
            'shared/ holds only cross-feature code and must not import features or the composition roots.',
        },
      ],
      ['src/shared/**/*.{ts,tsx}'],
    ),
  );

  return blocks;
}

const productIconsModule = 'src/shared/product-icons/productIcons.ts';
const specflowUiPackage = new URL('../../packages/specflow-ui/', import.meta.url);

/**
 * The product icon dictionary (`src/shared/product-icons`) is the only production module that may
 * import its glyphs. The rule gets every `lucide-react` export name of those glyphs, aliases
 * included (`Home`, `House`, `HomeIcon`, `LucideHome` are one component), so a renamed import
 * cannot slip past it.
 */
function productIconBlock() {
  const { glyphs, retired, registryNames } = JSON.parse(
    readFileSync(new URL('src/shared/product-icons/productGlyphs.json', specflowUiPackage), 'utf8'),
  );
  const lucide = createRequire(new URL('package.json', specflowUiPackage))('lucide-react');
  const components = new Set([...glyphs, ...retired].map((name) => lucide[name]));
  const names = Object.keys(lucide).filter((name) => components.has(lucide[name]));

  return {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [productIconsModule, ...nonProductionUiSources, 'src/**/*.figma.tsx', 'src/mocks/**'],
    plugins: { 'specflow-icons': productIconRule },
    rules: {
      'specflow-icons/no-direct-product-icon': [
        'error',
        { glyphs: names, registryNames, module: productIconsModule },
      ],
    },
  };
}

/**
 * Package direction plus module ownership: a component lives in the module that owns the
 * capability and features talk to each other only through their public barrel
 * (`features/<name>/index.ts`). Composition roots (`app/`, `services/`) and
 * tests/stories/story-support are not restricted. A file matched here replaces the package-wide
 * rule, so the shared patterns repeat.
 */
export const specflowUiBoundaries = [
  restrict(specflowUiSharedPatterns),
  ...boundaryBlocks(),
  // Reader-facing copy in components comes from the i18n catalogue (`src/i18n/locales`).
  {
    files: ['src/**/*.tsx'],
    ignores: [
      'src/**/*.{test,stories}.tsx',
      'src/**/*.figma.tsx',
      'src/**/*.stories-support.tsx',
      'src/test-support/**',
    ],
    plugins: { 'specflow-i18n': i18nCopy },
    rules: { 'specflow-i18n/no-hardcoded-copy': 'error' },
  },
  productIconBlock(),
  // `crypto.randomUUID` exists only in secure contexts; a Runtime opened over plain http on a LAN
  // or Tailscale host has none, and a command that throws before it is sent shows nothing.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/shared/ids/newId.ts', 'src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='randomUUID']",
          message: 'Use newId() (src/shared/ids/newId.ts): randomUUID is missing over plain http.',
        },
      ],
    },
  },
];

/**
 * Static React Hooks checks for product and design-system UI sources. Rules of Hooks is a hard
 * gate; Exhaustive Deps is analysed per finding (separate synchronisation from operation logic)
 * rather than fixed by blindly adding dependencies.
 */
export function reactHooksBlock(extraIgnores = []) {
  return {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/**/*.{test,stories}.{ts,tsx}',
      'src/**/*.stories-support.{ts,tsx}',
      'src/**/*.test-support.{ts,tsx}',
      ...extraIgnores,
    ],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  };
}
