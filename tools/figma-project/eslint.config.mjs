import { packageConfig } from '../../eslint.base.mjs';

export default packageConfig({
  tsconfigRootDir: import.meta.dirname,
  node: true,
  registryFiles: ['src/project/captureRegistry.ts', 'src/types.ts'],
});
