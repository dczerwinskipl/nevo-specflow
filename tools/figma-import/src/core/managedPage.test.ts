import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('dynamic-page document access', () => {
  it('changes pages only through the asynchronous Figma API', async () => {
    const sources = await Promise.all([
      readFile('src/core/managedPage.ts', 'utf8'),
      readFile('src/commands.ts', 'utf8'),
    ]);
    expect(sources.join('\n')).not.toMatch(/figma\.currentPage\s*=/);
    expect(sources.join('\n')).toContain('figma.setCurrentPageAsync');
  });

  it('resolves instance main components only through the dynamic-page-safe API', async () => {
    const files = (await readdir('src', { recursive: true })).filter(
      (file) => file.endsWith('.ts') && !file.endsWith('.test.ts'),
    );
    const source = (
      await Promise.all(files.map((file) => readFile(`src/${file.split('\\').join('/')}`, 'utf8')))
    ).join('\n');

    expect(source).not.toMatch(/\.mainComponent\b/);
    expect(source).toContain('getMainComponentAsync');
  });
});
