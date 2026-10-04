import { writeFile } from 'node:fs/promises';

import { renderBrandEnvironmentCss } from '../src/design-system/brandEnvironment';

await writeFile(
  new URL('../src/design-system/brand-environment.generated.css', import.meta.url),
  renderBrandEnvironmentCss(),
);
