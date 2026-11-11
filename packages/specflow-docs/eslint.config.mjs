import { packageConfig } from '../../eslint.base.mjs';
import { specflowDocsBoundaries } from '../../tools/eslint/boundaries.mjs';

export default packageConfig({
  tsconfigRootDir: import.meta.dirname,
  product: true,
  node: true,
  boundaries: specflowDocsBoundaries,
});
