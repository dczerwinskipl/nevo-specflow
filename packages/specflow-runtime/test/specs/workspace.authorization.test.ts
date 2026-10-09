import { describe, expect, it } from 'vitest';
import type { SpecificationWorkspaceResponse } from '@nevo/specflow-contracts/specs/workspace';
import { createDemoSpecsRepositories } from '../../src/features/specs/demo/repositories';
import { authorizeSessionReferences } from '../../src/features/specs/workspace/authorize-projection';
import { presentWorkspace } from '../../src/features/specs/workspace/presenter';

describe('Workspace Session authorization projection', () => {
  it('filters all Session references, independently of visibility of the Sessions section', async () => {
    const source =
      await createDemoSpecsRepositories().workspaceRepository.readWorkspace('admission');
    if (!source) throw new Error('Missing demonstration Specification');
    const snapshot = presentWorkspace({
      ...source,
      recommendedSessionId: 'sample-session-23',
      sections: {
        ...source.sections,
        attention: {
          state: 'available',
          data: {
            items: [
              {
                id: 'blocked',
                kind: 'session',
                title: 'Secret title',
                reason: 'Secret reason',
                targetId: 'sample-session-23',
              },
              {
                id: 'allowed',
                kind: 'session',
                title: 'Visible title',
                reason: 'Visible reason',
                targetId: 'sample-session-24',
              },
            ],
          },
        },
        activity: {
          state: 'available',
          data: {
            items: [
              {
                id: 'hidden',
                kind: 'session',
                targetId: 'sample-session-23',
                occurredAt: '2026-10-09',
                title: 'Hidden session activity',
                description: 'Secret',
              },
              {
                id: 'visible',
                kind: 'session',
                targetId: 'sample-session-24',
                occurredAt: '2026-10-09',
                title: 'Visible session activity',
                description: 'Public',
              },
              {
                id: 'generic-hidden',
                kind: 'info',
                relatedSessionId: 'sample-session-23',
                occurredAt: '2026-10-09',
                title: 'Generic secret',
                description: 'Secret',
              },
            ],
          },
        },
      },
    });
    const permitted = (id: string) => id === 'sample-session-24';
    const check = (value: SpecificationWorkspaceResponse) => {
      const filtered = authorizeSessionReferences(value, permitted);
      const serialized = JSON.stringify(filtered);
      expect(serialized).not.toContain('sample-session-23');
      expect(serialized).not.toContain('Secret');
      expect(serialized).not.toContain('Generic secret');
      expect(serialized).toContain('Visible session activity');
      expect(filtered.recommendedSessionId).toBeUndefined();
      return filtered;
    };
    const filtered = check(snapshot);
    expect(filtered.sections.sessions.state).toBe('available');
    const unavailable = check({
      ...snapshot,
      recommendedSessionId: 'sample-session-24',
      sections: {
        ...snapshot.sections,
        sessions: { state: 'unavailable', reason: 'source_unavailable' },
      },
    });
    expect(unavailable.recommendedSessionId).toBeUndefined();
    check({
      ...snapshot,
      sections: {
        ...snapshot.sections,
        sessions: { state: 'forbidden' },
      },
    });
  });

  it('never returns an unauthorized Session detail when none are permitted', async () => {
    const source =
      await createDemoSpecsRepositories().workspaceRepository.readWorkspace('admission');
    if (!source) throw new Error('Missing demonstration Specification');
    const filtered = authorizeSessionReferences(presentWorkspace(source), () => false);
    expect(filtered.sections.sessions).toEqual({ state: 'forbidden' });
    expect(filtered.recommendedSessionId).toBeUndefined();
    const attention = filtered.sections.attention;
    if (attention.state === 'available') {
      expect(attention.data.items.every((item) => item.kind !== 'session')).toBe(true);
    }
  });
});
