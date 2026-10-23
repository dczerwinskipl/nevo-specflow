// Runtime package direction and module-ownership rules.
//
// Runtime module ownership mirrors the UI rule: a capability lives in the feature that owns it and
// features reach each other only through the public barrel (`features/<name>/index.ts`). The demo
// environment composition root (`src/demo/index`) is wired only by the server; features may use
// the shared demo state, catalogue and HTTP helpers (`src/demo/state`, `catalogue`, `http`).
import { productImportRestrictions, restrict } from './imports.mjs';

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
  const nonProduction = ['src/**/*.test.ts'];
  return runtimeFeatures.map((feature) => ({
    files: [`src/features/${feature}/**/*.ts`],
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

export const specflowRuntimeBoundaries = [
  restrict([
    {
      regex: '^@nevo/(?:specflow|specflow-ui)(?:/|$)',
      message: 'Runtime must not depend on the product composition root or UI.',
    },
  ]),
  restrict(runtimeSharedPatterns, ['src/**/*.{ts,tsx,mts,cts}']),
  ...runtimeBoundaryBlocks(),
];
