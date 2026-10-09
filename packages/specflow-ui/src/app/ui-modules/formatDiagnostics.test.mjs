import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import { it } from 'vitest';

it('prints exact Prettier formatting for registry test', async () => {
  const file = fileURLToPath(new URL('./registry.test.tsx', import.meta.url));
  const settings = await prettier.resolveConfig(file);
  const formatted = await prettier.format(readFileSync(file, 'utf8'), {
    ...settings,
    filepath: file,
  });
  process.stdout.write('REGISTRY_PRETTIER_BASE64:' + Buffer.from(formatted).toString('base64') + '\n');
});
