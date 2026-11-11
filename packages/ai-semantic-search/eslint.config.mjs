import { packageConfig } from '../../eslint.base.mjs';
import { aiSemanticSearchBoundaries } from '../../tools/eslint/boundaries.mjs';

export default packageConfig({
  tsconfigRootDir: import.meta.dirname,
  product: true,
  node: true,
  boundaries: aiSemanticSearchBoundaries,
});
