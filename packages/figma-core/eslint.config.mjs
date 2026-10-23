import { explicitProject, packageConfig } from '../../eslint.base.mjs';
import { figmaCoreBoundaries } from '../../tools/eslint/boundaries.mjs';

export default packageConfig({
  tsconfigRootDir: import.meta.dirname,
  product: true,
  // Neutral production projects intentionally exclude Node-powered tests.
  projects: [explicitProject(['**/*.test.{ts,tsx}'], './tsconfig.test.json', import.meta.dirname)],
  boundaries: figmaCoreBoundaries,
  registryFiles: ['src/metadata.ts'],
});
