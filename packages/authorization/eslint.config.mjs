import { packageConfig } from '../../eslint.base.mjs';
import { neutralFoundationBoundaries } from '../../tools/eslint/boundaries.mjs';

export default packageConfig({
  tsconfigRootDir: import.meta.dirname,
  product: true,
  boundaries: neutralFoundationBoundaries,
});
