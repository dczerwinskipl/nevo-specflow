import { describe, expect, it } from 'vitest';
import type { WorkspaceListItem } from '@nevo/specflow-contracts/workspaces';
import { displayPath, workspaceFacts } from './workspacePickerModel';

describe('workspace picker display', () => {
  it('shortens folders relative to the project folder', () => {
    const base = '/work/repos/nevo';
    expect(displayPath('/work/repos/nevo', base)).toBe('.');
    expect(displayPath('/work/repos/nevo/.nevo/worktrees/a', base)).toBe('.nevo/worktrees/a');
    expect(displayPath('/work/repos/nevo-wt/a', base)).toBe('../nevo-wt/a');
    expect(displayPath('/elsewhere/a', base)).toBe('/elsewhere/a');
    expect(displayPath('/elsewhere/a', undefined)).toBe('/elsewhere/a');
  });

  it('handles Windows separators and drive case', () => {
    expect(displayPath('d:\\repos\\nevo\\wt\\a', 'D:\\repos\\nevo')).toBe('wt/a');
  });
});

describe('workspace facts', () => {
  const item = (extra: Partial<WorkspaceListItem> = {}): WorkspaceListItem => ({
    workspaceId: 'ws',
    kind: 'linked',
    name: 'ws',
    path: '/work/ws',
    available: true,
    isRuntimeWorkspace: false,
    specifications: [],
    ...extra,
  });

  it('maps the kind, the bound Specification titles and the Session workspace', () => {
    expect(workspaceFacts(item({ specifications: [{ specId: 's', title: 'SSO' }] }), 'ws')).toEqual(
      { kind: 'worktree', specifications: ['SSO'], sessionWorkspace: true },
    );
    expect(workspaceFacts(item({ kind: 'primary' }), 'other')).toEqual({
      kind: 'projectFolder',
      specifications: [],
      sessionWorkspace: false,
    });
  });

  it('shows local changes only for a dirty checkout, none for a clean or detached one', () => {
    expect(workspaceFacts(item({ dirty: true })).status).toEqual({ kind: 'localChanges' });
    expect(workspaceFacts(item({ dirty: false })).status).toBeUndefined();
    // A detached checkout has no dirty flag.
    expect(workspaceFacts(item()).status).toBeUndefined();
  });

  it('shows an unavailable pick with its reason, before any local changes', () => {
    expect(
      workspaceFacts(
        item({ available: false, unavailableReason: 'checkout-unavailable', dirty: true }),
      ).status,
    ).toEqual({ kind: 'unavailable', reason: 'checkout-unavailable' });
  });
});
