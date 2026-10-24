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

/** `authorization` and `http-client`: product-neutral foundations. */
export const neutralFoundationBoundaries = [
  restrict([
    {
      regex: '^@nevo/specflow(?:-|/|$)',
      message: 'Product-neutral foundation packages must not depend on SpecFlow product packages.',
    },
  ]),
];

export const specflowContractsBoundaries = [
  restrict([
    {
      regex: '^@nevo/(?:specflow|specflow-engine|specflow-runtime|specflow-ui)(?:/|$)',
      message: 'Shared SpecFlow contracts must not depend on the product shell, Runtime, or UI.',
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
