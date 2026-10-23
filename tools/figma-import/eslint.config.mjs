import { packageConfig } from '../../eslint.base.mjs';
import { callbackDoubles, playwrightEvaluation } from '../../tools/eslint/overrides.mjs';

export default packageConfig({
  tsconfigRootDir: import.meta.dirname,
  node: true,
  overrides: [callbackDoubles(['**/*.test.ts']), playwrightEvaluation(['ui.test.ts'])],
});
