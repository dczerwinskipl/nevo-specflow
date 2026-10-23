import { packageConfig } from '../../eslint.base.mjs';

export default packageConfig({
  tsconfigRootDir: import.meta.dirname,
  registryFiles: ['src/figmaRegistry.ts'],
});
