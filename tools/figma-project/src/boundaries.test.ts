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
        return /\.(?:ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.')
          ? [candidate]
          : [];
      }),
    )
  ).flat();
}

async function combinedSource(root: string) {
  return (
    await Promise.all((await sourceFiles(root)).map(async (file) => readFile(file, 'utf8')))
  ).join('\n');
}

async function runtimeDependencies(packageRoot: string) {
  const manifest = JSON.parse(await readFile(`${packageRoot}/package.json`, 'utf8')) as {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  return {
    ...manifest.dependencies,
    ...manifest.peerDependencies,
  };
}

describe('frontend and Figma dependency boundaries', () => {
  it('keeps reusable Nevo UI independent from SpecFlow and its router', async () => {
    const [source, packageDependencies] = await Promise.all([
      combinedSource('../../packages/nevo-ui/src'),
      runtimeDependencies('../../packages/nevo-ui'),
    ]);

    expect(source).not.toMatch(/@nevo\/specflow(?:-|\/|$)/);
    expect(source).not.toContain('@tanstack/react-router');
    expect(source).not.toMatch(/\b(?:Specification|Agent Session|SpecFlow)\b/);
    expect(Object.keys(packageDependencies)).not.toContainEqual(
      expect.stringMatching(/^@nevo\/specflow(?:-|\/|$)/),
    );
    expect(packageDependencies).not.toHaveProperty('@tanstack/react-router');
  });

  it('keeps Figma core independent from React, capture runtime, and product UI', async () => {
    const [source, packageDependencies] = await Promise.all([
      combinedSource('../../packages/figma-core/src'),
      runtimeDependencies('../../packages/figma-core'),
    ]);

    expect(source).not.toMatch(/from ['"]react(?:-dom)?(?:\/|['"])/);
    expect(source).not.toMatch(/@nevo\/(?:figma-capture|ui|specflow)(?:-|\/|$)/);
    expect(Object.keys(packageDependencies)).not.toContainEqual(
      expect.stringMatching(/^(?:react(?:-dom)?|@nevo\/(?:figma-capture|ui|specflow)(?:-|\/|$))/),
    );
  });

  it('keeps Figma capture limited to React and neutral Figma core', async () => {
    const [source, packageDependencies] = await Promise.all([
      combinedSource('../../packages/figma-capture/src'),
      runtimeDependencies('../../packages/figma-capture'),
    ]);

    expect(source).not.toContain('@nevo/ui');
    expect(source).not.toMatch(/@nevo\/specflow(?:-|\/|$)/);
    expect(source).not.toMatch(/from ['"]react-dom(?:\/|['"])/);
    expect(source).not.toMatch(/\b(?:Button|Drawer|AppShell|CRM|SpecFlow)\b/);
    expect(Object.keys(packageDependencies).sort()).toEqual(['@nevo/figma-core', 'react']);
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
