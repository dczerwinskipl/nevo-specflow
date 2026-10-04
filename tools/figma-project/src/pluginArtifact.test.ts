import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('SpecFlow Figma plugin ownership', () => {
  it('keeps the project identity and generated artifact inside figma-project', async () => {
    const [manifestSource, buildSource] = await Promise.all([
      readFile('manifest.json', 'utf8'),
      readFile('build-plugin.mjs', 'utf8'),
    ]);
    const manifest = JSON.parse(manifestSource) as { id: string; main: string; ui: string };

    expect(manifest.id).toBe('nevo-specflow-ir-importer-local');
    expect(manifest.main).toBe('dist/plugin/code.js');
    expect(manifest.ui).toBe('dist/plugin/ui.html');
    expect(buildSource).not.toContain('figma-import/dist');
  });
});
