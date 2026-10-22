import { describe, expect, it } from 'vitest';
import { productNavigationItems, showsNoSpecificationHint } from './productNavigationModel';

describe('product navigation model', () => {
  it('declares destinations and capability availability together, without inventing a Tasks route', () => {
    const items = productNavigationItems('a/b', '/specs/a%2Fb/documents/spec');
    expect(items.map((item) => item.id)).toEqual([
      'overview',
      'sessions',
      'tasks',
      'documents',
      'changes',
      'repository',
    ]);
    // Tasks is the existing Work section on the Overview route, reached via its #hash anchor;
    // it is not a new standalone page.
    expect(items.find((item) => item.id === 'tasks')).toMatchObject({
      to: '/specs/$specId',
      hash: 'tasks-heading',
      active: false,
    });
    expect(items.filter((item) => item.active).map((item) => item.id)).toEqual(['documents']);
    expect(productNavigationItems('a', '/specs/a', false).map((item) => item.id)).toEqual([
      'overview',
      'sessions',
      'tasks',
      'documents',
    ]);
  });
  it('matches complete path boundaries and selects only exact Overview', () => {
    expect(
      productNavigationItems('a', '/specs/a/documents-other').some((item) => item.active),
    ).toBe(false);
    expect(
      productNavigationItems('a', '/specs/a')
        .filter((item) => item.active)
        .map((item) => item.id),
    ).toEqual(['overview']);
    expect(productNavigationItems(null, '/').some((item) => item.active)).toBe(false);
  });
  it('distinguishes Tasks from Overview on the same route by hash, not by a second path', () => {
    expect(
      productNavigationItems('a', '/specs/a', true, 'tasks-heading')
        .filter((item) => item.active)
        .map((item) => item.id),
    ).toEqual(['tasks']);
    expect(
      productNavigationItems('a', '/specs/a', true, '')
        .filter((item) => item.active)
        .map((item) => item.id),
    ).toEqual(['overview']);
  });
  it('does not render Git destinations until navigation metadata has settled', () => {
    const ids = (settled: boolean, hasGit?: boolean) =>
      productNavigationItems('a', '/specs/a', hasGit, '', settled).map((item) => item.id);
    expect(ids(false)).toEqual(['overview', 'sessions', 'tasks', 'documents']);
    expect(ids(false, true)).toEqual(['overview', 'sessions', 'tasks', 'documents']);
    // Settled unknown (source_unavailable) is not absent; settled unsupported hides.
    expect(ids(true)).toContain('changes');
    expect(ids(true, false)).not.toContain('changes');
  });
  it('hides the select-a-specification hint only while creating a specification', () => {
    expect(showsNoSpecificationHint('/specs/new')).toBe(false);
    expect(showsNoSpecificationHint('/specs/new/')).toBe(false);
    expect(showsNoSpecificationHint('/')).toBe(true);
    expect(showsNoSpecificationHint('/specs')).toBe(true);
    expect(showsNoSpecificationHint('/specs/newton')).toBe(true);
  });
});
