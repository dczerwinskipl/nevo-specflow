import { describe, expect, it } from 'vitest';
import { createSpecificationWorkspaceFixture } from '../../../test-support/specs/workspace/fixtures';
import { overviewSessions } from './uiModule';

describe('Overview Sessions', () => {
  it('lists the recommended Session first and never a Session already in Requires attention', () => {
    const data = createSpecificationWorkspaceFixture('working');
    // The fixture's `review` Session waits for the person: it is a Requires attention item.
    const ids = overviewSessions(data).map((session) => session.id);

    expect(ids[0]).toBe(data.resumeSession?.id);
    expect(ids).not.toContain('review');
    expect(ids.length).toBeLessThanOrEqual(3);
  });
});
