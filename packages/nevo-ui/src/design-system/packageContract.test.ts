import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('@nevo/ui package contract', () => {
  it('publishes built JavaScript, declarations, and CSS without bundling React ownership', async () => {
    const manifest = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as {
      dependencies?: Record<string, string>;
      exports: Record<string, string | { import: string; types: string }>;
      peerDependencies?: Record<string, string>;
    };
    const targets = Object.values(manifest.exports).flatMap((entry) =>
      typeof entry === 'string' ? [entry] : [entry.import, entry.types],
    );

    expect(targets).not.toHaveLength(0);
    expect(targets.every((target) => target.startsWith('./dist/'))).toBe(true);
    expect(manifest.exports['./styles.css']).toBe('./dist/styles.css');
    expect(manifest.dependencies).not.toHaveProperty('react');
    expect(manifest.dependencies).not.toHaveProperty('react-dom');
    expect(manifest.peerDependencies).toMatchObject({ react: '>=19 <20', 'react-dom': '>=19 <20' });
  });
});
