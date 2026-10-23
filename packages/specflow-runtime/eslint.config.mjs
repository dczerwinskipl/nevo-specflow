import { packageConfig } from '../../eslint.base.mjs';
import { specflowRuntimeBoundaries } from '../../tools/eslint/specflow-runtime.mjs';

export default packageConfig({
  tsconfigRootDir: import.meta.dirname,
  product: true,
  node: true,
  boundaries: specflowRuntimeBoundaries,
});
