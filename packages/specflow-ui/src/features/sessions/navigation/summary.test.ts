import { describe, it, expect } from 'vitest';
import { projectSessionNavigation } from './summary';
import { createSpecificationWorkspaceFixture } from '../../../../test-support/specs/workspace/fixtures';
const base = createSpecificationWorkspaceFixture('working', 's');
describe('Sessions navigation summary', () => {
  it('preserves unknown, unavailable, partial and forbidden instead of claiming zero', () => {
    expect(projectSessionNavigation(undefined, undefined)).toEqual({ state: 'unknown' });
    expect(projectSessionNavigation(undefined, undefined, true)).toEqual({ state: 'loading' });
    expect(
      projectSessionNavigation(
        { ...base, sectionAvailability: { sessions: 'unavailable' } },
        undefined,
      ),
    ).toEqual({ state: 'unavailable' });
    expect(
      projectSessionNavigation(base, Object.assign(new Error('denied'), { status: 403 })),
    ).toEqual({ state: 'forbidden' });
    expect(
      projectSessionNavigation(
        {
          ...base,
          sessions: [
            {
              id: 'unknown',
              title: 'Agent running',
              activity: { label: 'Waiting for your reply' },
            },
          ],
        },
        undefined,
      ),
    ).toMatchObject({ state: 'partial', count: undefined, entries: [] });
  });
  it('orders known attention before activity, bounds references and retains exact complete count', () => {
    const sessions = Array.from({ length: 5 }, (_, index) => ({
      id: `session-${index}`,
      title: `Session ${index}`,
      activityCode: index === 3 ? ('attention' as const) : ('active' as const),
    }));
    expect(projectSessionNavigation({ ...base, sessions }, undefined)).toMatchObject({
      state: 'available',
      count: 5,
      entries: [sessions[3], sessions[0], sessions[1]],
      attention: true,
    });
    expect(projectSessionNavigation({ ...base, sessions }, new Error('refresh'))).toMatchObject({
      state: 'stale',
      count: undefined,
      entries: [sessions[3], sessions[0], sessions[1]],
    });
  });
  it('withholds the count while the bounded section has more Sessions', () => {
    const sessions = [{ id: 'a', title: 'A', activityCode: 'active' as const }];
    expect(
      projectSessionNavigation({ ...base, sessions, sessionsHasMore: true }, undefined),
    ).toMatchObject({ state: 'partial', count: undefined, entries: sessions });
    expect(
      projectSessionNavigation(
        { ...base, sessions: [...sessions, { id: 'u', title: 'U', navigationStatus: 'unknown' }] },
        undefined,
      ),
    ).toMatchObject({ state: 'partial', count: undefined });
  });
  it('reads turned-off Sessions as disabled, not as a failed read', () => {
    const off = {
      ...base,
      sectionAvailability: { sessions: 'unavailable' as const },
      sectionUnavailableReason: { sessions: 'source_unavailable' as const },
    };
    expect(
      projectSessionNavigation(
        { ...off, startSession: { available: false, reason: 'sessions_disabled' } },
        undefined,
      ),
    ).toEqual({ state: 'disabled' });
    expect(projectSessionNavigation(off, undefined)).toEqual({ state: 'unavailable' });
  });
  it('does not label known quiet history as active or infer its completion', () => {
    expect(
      projectSessionNavigation(
        { ...base, sessions: [{ id: 'quiet', title: 'Quiet session', navigationStatus: 'quiet' }] },
        undefined,
      ),
    ).toMatchObject({ state: 'available', count: 0, entries: [] });
  });
  it('keeps a provider sign-in out of the preview without making the count partial', () => {
    expect(
      projectSessionNavigation(
        {
          ...base,
          sessions: [
            { id: 'sign-in', title: 'Sign-in', navigationStatus: 'authenticationRequired' },
            { id: 'active', title: 'Active', navigationStatus: 'active', activityCode: 'active' },
          ],
        },
        undefined,
      ),
    ).toMatchObject({ state: 'available', count: 1, entries: [{ id: 'active' }] });
  });
});
