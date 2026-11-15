import { describe, expect, it, vi } from 'vitest';

import { openProjectDocumentLookup } from './project-document-lookup';

describe('openProjectDocumentLookup', () => {
  it("asks the Specification's own workspace, once per request and workspace", async () => {
    const documents: Record<string, readonly string[]> = {
      home: ['guide'],
      linked: ['guide', 'worktree-only'],
    };
    const activeDocumentIds = vi.fn((workspaceId: string) =>
      Promise.resolve(new Set(documents[workspaceId] ?? [])),
    );
    const open = openProjectDocumentLookup(activeDocumentIds);
    expect(activeDocumentIds).not.toHaveBeenCalled();

    const lookup = open();
    const linked = { workspaceId: 'linked', root: '/worktrees/linked' };
    const home = { workspaceId: 'home', root: '/home' };
    await expect(lookup(linked, 'worktree-only')).resolves.toBe(true);
    await expect(lookup(linked, 'missing')).resolves.toBe(false);
    await expect(lookup(home, 'worktree-only')).resolves.toBe(false);
    expect(activeDocumentIds.mock.calls).toEqual([['linked'], ['home']]);

    // The next request sees the documentation as it is then.
    await open()(linked, 'guide');
    expect(activeDocumentIds).toHaveBeenCalledTimes(3);
  });
});
