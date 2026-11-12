import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { projectDocumentLookup } from './project-document-lookup';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function document(id: string, status: string): string {
  return `---\nid: ${id}\ntype: reference\ntitle: ${id}\nstatus: ${status}\n---\n\n# ${id}\n`;
}

async function corpus(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'specflow-project-docs-'));
  roots.push(root);
  await mkdir(join(root, 'docs'));
  await mkdir(join(root, '.nevo'));
  await writeFile(join(root, 'docs', 'a.md'), document('engineering.shared.testing', 'current'));
  await writeFile(join(root, 'docs', 'b.md'), document('engineering.old', 'deprecated'));

  return root;
}

describe('projectDocumentLookup', () => {
  it('resolves an active document and refuses an unknown or inactive one', async () => {
    const lookup = projectDocumentLookup(await corpus());

    expect(await lookup('engineering.shared.testing')).toBe(true);
    expect(await lookup('engineering.old')).toBe(false);
    expect(await lookup('engineering.missing')).toBe(false);
  });

  it('reads nothing until the first lookup', async () => {
    const root = await mkdtemp(join(tmpdir(), 'specflow-project-docs-'));
    roots.push(root);

    // No docs root exists, yet building the lookup does not scan.
    expect(() => projectDocumentLookup(root)).not.toThrow();
  });
});
