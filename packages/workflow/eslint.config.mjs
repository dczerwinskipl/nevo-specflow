import { packageConfig } from '../../eslint.base.mjs';
import { workflowBoundaries } from '../../tools/eslint/boundaries.mjs';

// The kernel is deterministic: no ambient runtime, clock or randomness. Timestamps come from the host.
const AMBIENT = [
  'process',
  'Buffer',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'queueMicrotask',
  'require',
  '__dirname',
  '__filename',
  'Date',
  'performance',
].map((name) => ({
  name,
  message: 'The workflow kernel is pure; the host supplies time and I/O.',
}));

export default packageConfig({
  tsconfigRootDir: import.meta.dirname,
  product: true,
  boundaries: workflowBoundaries,
  overrides: [
    {
      files: ['**/*.{ts,mts,cts}'],
      rules: {
        'no-restricted-globals': ['error', ...AMBIENT],
        'no-restricted-properties': [
          'error',
          { object: 'Math', property: 'random', message: 'The workflow kernel is deterministic.' },
        ],
      },
    },
  ],
});
