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
  return `---\nid: ${id}\ntype: hub\ntitle: ${id}\nstatus: ${status}\n---\n\n# ${id}\n`;
}

async function checkout(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'specflow-project-docs-'));
  roots.push(root);
  await mkdir(join(root, 'docs'));
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(root, 'docs', name), content);
  }

  return root;
}

describe('projectDocumentLookup', () => {
  it('resolves an active document and refuses an unknown or inactive one', async () => {
    const root = await checkout({
      'a.md': document('engineering.shared.testing', 'current'),
      'b.md': document('engineering.old', 'deprecated'),
    });
    const lookup = projectDocumentLookup();
    const spec = { workspaceId: 'w-1', root };

    expect(await lookup(spec, 'engineering.shared.testing')).toBe(true);
    expect(await lookup(spec, 'engineering.old')).toBe(false);
    expect(await lookup(spec, 'engineering.missing')).toBe(false);
  });

  it("reads the Specification's own checkout: a document only in its worktree resolves", async () => {
    const home = await checkout({ 'a.md': document('engineering.home', 'current') });
    const worktree = await checkout({ 'a.md': document('engineering.worktree-only', 'current') });
    const lookup = projectDocumentLookup();

    expect(
      await lookup({ workspaceId: 'linked', root: worktree }, 'engineering.worktree-only'),
    ).toBe(true);
    expect(await lookup({ workspaceId: 'linked', root: worktree }, 'engineering.home')).toBe(false);
    expect(await lookup({ workspaceId: 'home', root: home }, 'engineering.worktree-only')).toBe(
      false,
    );
  });

  it('resolves nothing in a checkout without documentation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'specflow-project-docs-'));
    roots.push(root);

    expect(await projectDocumentLookup()({ workspaceId: 'w-1', root }, 'anything')).toBe(false);
  });
});
