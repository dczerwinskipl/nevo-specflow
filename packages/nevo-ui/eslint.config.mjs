import { explicitProject, packageConfig } from '../../eslint.base.mjs';
import { nevoUiBoundaries } from '../../tools/eslint/boundaries.mjs';
import { callbackDoubles } from '../../tools/eslint/overrides.mjs';
import { reactHooksBlock } from '../../tools/eslint/specflow-ui.mjs';

export default packageConfig({
  tsconfigRootDir: import.meta.dirname,
  product: true,
  // Neutral production projects intentionally exclude Node-powered tests and package tooling.
  // Point ESLint at their dedicated TypeScript projects.
  projects: [
    explicitProject(
      ['**/*.test.{ts,tsx}', '**/*.stories.{ts,tsx}'],
      './tsconfig.test.json',
      import.meta.dirname,
    ),
    explicitProject(
      ['scripts/**/*.{ts,mts}', 'vite.config.ts'],
      './tsconfig.tools.json',
      import.meta.dirname,
    ),
  ],
  boundaries: [...nevoUiBoundaries, reactHooksBlock()],
  overrides: [callbackDoubles(['**/*.stories.tsx', '**/*.test.{ts,tsx}'])],
  registryFiles: ['src/figma/captureRegistry.ts'],
});
