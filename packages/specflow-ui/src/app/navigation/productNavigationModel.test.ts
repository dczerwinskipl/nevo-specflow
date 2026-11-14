import { describe, expect, it } from 'vitest';
import { productNavigationItems, showsNoSpecificationHint } from './productNavigationModel';

describe('product navigation model', () => {
  it('declares destinations and capability availability together', () => {
    const items = productNavigationItems('a/b', '/specs/a%2Fb/documents/spec');
    expect(items.map((item) => item.id)).toEqual([
      'overview',
      'sessions',
      'tasks',
      'documents',
      'changes',
      'repository',
    ]);
    expect(items.find((item) => item.id === 'tasks')).toMatchObject({
      to: '/specs/$specId/tasks',
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
  it('marks Sessions active on a Session of the Specification, off its own route', () => {
    const items = productNavigationItems('spec-s', '/sessions/B', undefined, true, 'sessions');

    expect(items.filter((item) => item.active).map((item) => item.id)).toEqual(['sessions']);
    expect(items.find((item) => item.id === 'sessions')?.to).toBe('/specs/$specId/sessions');
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
  it('keeps Tasks active on the Tasks page and on a Full Task under it', () => {
    const active = (pathname: string) =>
      productNavigationItems('a', pathname, true)
        .filter((item) => item.active)
        .map((item) => item.id);

    expect(active('/specs/a/tasks')).toEqual(['tasks']);
    expect(active('/specs/a/tasks/T-01')).toEqual(['tasks']);
  });
  it('does not render Git destinations until navigation metadata has settled', () => {
    const ids = (settled: boolean, hasGit?: boolean) =>
      productNavigationItems('a', '/specs/a', hasGit, settled).map((item) => item.id);
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
