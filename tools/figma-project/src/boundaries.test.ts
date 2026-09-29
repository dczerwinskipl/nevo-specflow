import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

async function sourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const candidate = path.join(root, entry.name);
        if (entry.isDirectory()) return sourceFiles(candidate);
        return /\.(?:ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [candidate] : [];
      }),
    )
  ).flat();
}

async function combinedSource(root: string) {
  return (
    await Promise.all((await sourceFiles(root)).map(async (file) => readFile(file, 'utf8')))
  ).join('\n');
}

describe('frontend and Figma dependency boundaries', () => {
  it('keeps reusable Nevo UI independent from SpecFlow and its router', async () => {
    const source = await combinedSource('../../packages/nevo-ui/src');

    expect(source).not.toContain('@nevo/specflow-ui');
    expect(source).not.toContain('@tanstack/react-router');
    expect(source).not.toMatch(/\b(?:Specification|Agent Session|SpecFlow)\b/);
  });

  it('keeps the neutral Figma core independent from concrete UI owners', async () => {
    const source = await combinedSource('../../packages/figma-core/src');

    expect(source).not.toContain('@nevo/ui');
    expect(source).not.toContain('@nevo/specflow-ui');
    expect(source).not.toMatch(/\b(?:Button|Drawer|AppShell|CRM|SpecFlow)\b/);
  });

  it('keeps generic exporter and importer behavior component-agnostic', async () => {
    const [exporter, importer] = await Promise.all([
      combinedSource('../figma-export/src'),
      combinedSource('../figma-import/src'),
    ]);

    expect(`${exporter}\n${importer}`).not.toMatch(/\b(?:Button|Drawer|AppShell|CRM|SpecFlow)\b/);
    expect(exporter).not.toContain('@nevo/ui');
    expect(importer).not.toContain('@nevo/ui');
  });

  it('keeps the CRM example independent from SpecFlow product code', async () => {
    const source = await combinedSource('../../examples/crm/src');

    expect(source).not.toContain('@nevo/specflow-ui');
  });
});
