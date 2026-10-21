import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

describe('Q04 registry dependency direction', () => {
  it('keeps the project infrastructure independent of Specification modules', async () => {
    const directory = fileURLToPath(new URL('../src/project/', import.meta.url));
    const entries = await readdir(directory, { recursive: true });
    for (const file of entries.filter((name) => name.endsWith('.ts'))) {
      const content = await readFile(join(directory, file), 'utf8');
      expect(content, file).not.toMatch(/(?:from|import\()\s*['"](?:\.\.\/)+specs\//u);
    }
  });
});
