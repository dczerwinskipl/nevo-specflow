import { packageConfig } from '../../eslint.base.mjs';
import { specflowContractsBoundaries } from '../../tools/eslint/boundaries.mjs';

export default packageConfig({
  tsconfigRootDir: import.meta.dirname,
  product: true,
  boundaries: specflowContractsBoundaries,
});
