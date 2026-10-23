import { packageConfig } from '../../eslint.base.mjs';
import { reactHooksBlock, specflowUiBoundaries } from '../../tools/eslint/specflow-ui.mjs';

export default packageConfig({
  tsconfigRootDir: import.meta.dirname,
  product: true,
  boundaries: [...specflowUiBoundaries, reactHooksBlock(['src/test-support/**'])],
  registryFiles: ['src/app/figmaRegistry.ts', 'src/brand/nevo/figmaDesignSystem.ts'],
});
