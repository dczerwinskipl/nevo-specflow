// Product package direction rules (ADR 0012). Each export is the list of config blocks for one
// package; a package's eslint.config.mjs passes the matching list as `boundaries`.
import { restrict } from './imports.mjs';

export const figmaCoreBoundaries = [
  restrict([
    {
      regex: '^(?:react(?:-dom)?(?:/|$)|@nevo/(?:figma-capture|ui|specflow)(?:-|/|$))',
      message:
        'Figma core is neutral authoring/IR infrastructure and must not depend on React, capture runtime, concrete UI, or SpecFlow product packages.',
    },
  ]),
];

export const figmaCaptureBoundaries = [
  restrict([
    {
      regex: '^@nevo/(?!figma-core(?:/|$))',
      message:
        'Figma capture may depend on neutral Figma core, but not on product or concrete UI packages.',
    },
    {
      regex: '^react-dom(?:/|$)',
      message: 'Figma capture uses React context only and must not depend on a DOM renderer.',
    },
  ]),
];

export const nevoUiBoundaries = [
  restrict([
    {
      regex: '^@nevo/specflow(?:-|/|$)',
      message: 'Reusable Nevo UI must not depend on any SpecFlow product package.',
    },
  ]),
];

const neutralFoundationPattern = {
  regex: '^@nevo/specflow(?:-|/|$)',
  message: 'Product-neutral foundation packages must not depend on SpecFlow product packages.',
};

/** `authorization` and `http-client`: product-neutral foundations. */
export const neutralFoundationBoundaries = [restrict([neutralFoundationPattern])];

/**
 * `ai-semantic-search`: a product-neutral foundation (ADR 0021) that additionally stays free of UI,
 * HTTP-server and CLI frameworks, provider SDKs (the adapter uses Node `fetch`) and native vector or
 * database modules (they break the bundled artifact). All patterns share one `no-restricted-imports`
 * block because a later block would replace, not extend, an earlier one.
 */
export const aiSemanticSearchBoundaries = [
  restrict([
    neutralFoundationPattern,
    {
      regex: '^(?:react(?:-dom)?|@fastify/.+|fastify|commander)(?:/|$)',
      message:
        'The semantic search engine is product-neutral and must not depend on UI, HTTP server or CLI frameworks.',
    },
    {
      regex:
        '^(?:openai|@anthropic-ai/.+|ollama|cohere-ai|@google/genai|@huggingface/.+|@mistralai/.+|voyageai|langchain|@langchain/.+)(?:/|$)',
      message:
        'The semantic search engine must not use a provider SDK; adapters call the HTTP API with Node fetch.',
    },
    {
      regex:
        '^(?:better-sqlite3|sqlite3|sqlite-vec|@lancedb/.+|vectordb|hnswlib-node|faiss-node|usearch|onnxruntime-node)(?:/|$)',
      message:
        'The semantic search engine must not use native modules; vector math is plain TypeScript.',
    },
  ]),
];

export const specflowContractsBoundaries = [
  restrict([
    {
      regex:
        '^@nevo/(?:specflow|specflow-engine|specflow-runtime|specflow-ui|specflow-docs)(?:/|$)',
      message:
        'Shared SpecFlow contracts must not depend on the product shell, a SpecFlow capability package (Engine, Runtime, docs) or UI.',
    },
  ]),
];

/**
 * `specflow-docs`: the documentation capability (ADR 0020). It may build on the neutral semantic
 * search engine, the shared contracts and neutral foundations, but not on Engine, Runtime, UI or the
 * product composition root; the shell passes it the project root instead.
 */
export const specflowDocsBoundaries = [
  restrict([
    {
      regex: '^@nevo/(?:specflow|specflow-engine|specflow-runtime|specflow-ui)(?:/|$)',
      message:
        'The documentation capability must not depend on Engine, Runtime, UI or the product shell (ADR 0012, ADR 0020).',
    },
  ]),
];

export const specflowEngineBoundaries = [
  restrict([
    {
      regex:
        '^(?:@nevo/specflow(?!-contracts(?:/|$))(?:-|/|$)|@fastify(?:/|$)|fastify(?:/|$)|commander(?:/|$)|react(?:-dom)?(?:/|$)|openid-client(?:/|$))',
      message: 'Engine is independent of CLI, Runtime, providers, HTTP, and UI adapters.',
    },
    {
      regex: '^@nevo/specflow-contracts(?:/(?!documents(?:/|$))|$)',
      message:
        'Engine may import only the neutral documents vocabulary from @nevo/specflow-contracts/documents (ADR 0012).',
    },
  ]),
];

/** The CLI / product composition root (`@nevo/specflow`). */
export const specflowCliBoundaries = [
  restrict(
    [
      {
        regex: '^@nevo/specflow-engine/testing(?:/|$)',
        message: 'Production CLI must use Engine application APIs, not the testing backdoor.',
      },
    ],
    ['src/**/*.{ts,tsx,mts,cts}'],
  ),
  // Package-owned build scripts execute directly through Node's native TypeScript support, so
  // their relative module specifiers use explicit .ts extensions.
  {
    files: ['packaging/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
];
