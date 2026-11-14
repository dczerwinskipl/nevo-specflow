import { describe, expect, it } from 'vitest';
import { displayPath, kindLine } from './workspacePickerModel';

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

  it('maps the kind and the bound Specification titles', () => {
    const item = {
      kind: 'linked',
      specifications: [{ specId: 's', title: 'SSO' }],
    } as Parameters<typeof kindLine>[0];
    expect(kindLine(item)).toEqual({ kind: 'worktree', specifications: ['SSO'] });
  });
});
