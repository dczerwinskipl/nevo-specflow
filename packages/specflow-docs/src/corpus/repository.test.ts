import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { createFileSystemDocRepository } from './repository';

const root = mkdtempSync(join(tmpdir(), 'specflow-docs-repository-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const doc = (id: string) => `---\nid: ${id}\ntype: hub\ntitle: ${id}\nstatus: current\n---\n`;
mkdirSync(join(root, 'docs'));
mkdirSync(join(root, 'outside'));
writeFileSync(join(root, 'docs', 'a.md'), doc('a'));
writeFileSync(join(root, 'outside', 'escape.md'), doc('escape'));
// Directory links: junctions on Windows (no privilege needed), symbolic links elsewhere.
const dirLink = process.platform === 'win32' ? 'junction' : 'dir';
symlinkSync(join(root, 'docs'), join(root, 'docs', 'loop'), dirLink);
symlinkSync(join(root, 'outside'), join(root, 'docs', 'outside'), dirLink);
// A file link needs a privilege on Windows; without it only the directory links are covered.
let fileLink = true;
try {
  symlinkSync(join(root, 'outside', 'escape.md'), join(root, 'docs', 'linked.md'), 'file');
} catch {
  fileLink = false;
}

describe('file system doc repository', () => {
  const repo = createFileSystemDocRepository({ projectRoot: root, root: 'docs' });

  it(`follows no symbolic link: no cycle, nothing from outside docs.root (file link: ${String(fileLink)})`, async () => {
    expect(repo.scan().docs.map((record) => record.file)).toEqual(['docs/a.md']);
    expect(await repo.listMarkdownFiles()).toEqual(['docs/a.md']);
  });
});
