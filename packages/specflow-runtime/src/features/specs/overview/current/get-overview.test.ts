import { CurrentSpecsOverviewSchema } from '@nevo/specflow-contracts/specs/overview';
import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import type { RequestAuthorization } from '../../../auth';
import type { CurrentSpecRecord } from '../repository/model';
import { getCurrentOverview } from './get-overview';

const everyone = {
  can: () => true,
  filterByCapability: <T>(items: readonly T[]) => [...items],
} as unknown as RequestAuthorization;

function record(overrides: Partial<CurrentSpecRecord>): CurrentSpecRecord {
  return {
    id: 'spec',
    title: 'Spec',
    updatedAt: '2026-11-25T10:00:00.000Z',
    progress: { completed: 0, total: 2 },
    workflow: { kind: 'step', state: 'ready', step: { title: 'Review', position: 5, count: 7 } },
    signals: [],
    currentExecutions: [],
    ...overrides,
  };
}

describe('getCurrentOverview', () => {
  it('passes the first attention item and an unreadable reason on to the response', async () => {
    const items = [
      record({
        id: 'attention',
        signals: [
          {
            id: 'workflow-attention',
            kind: 'attention',
            label: 'Requires attention',
            count: 2,
            priority: 0,
            target: { kind: 'specification', specId: 'attention' },
          },
        ],
        attention: {
          first: {
            id: 'specification-attention',
            kind: 'specification',
            title: 'Review',
            reason: 'The owner starts Review.',
            code: 'owner-action',
            stepTitle: 'Review',
            actor: 'owner',
            action: 'start-step',
          },
        },
      }),
      record({ id: 'broken', workflow: null, signals: null, unreadable: { reason: 'invalid' } }),
    ];
    const overview = await getCurrentOverview({
      authorization: everyone,
      repository: {
        readCurrent: () => Promise.resolve({ revision: 'r', items }),
        readArchive: () => Promise.resolve({ revision: 'r', items: [] }),
      },
      sections: ['requires-attention', 'in-progress', 'not-started', 'ended'],
    });

    expect(overview.items[0]).toMatchObject({
      classification: { section: 'requires-attention', count: 2 },
      attention: { first: { action: 'start-step', stepTitle: 'Review' } },
    });
    expect(overview.items[1]).toMatchObject({
      workflow: null,
      classification: { section: 'unknown' },
      unreadable: { reason: 'invalid' },
    });
    expect(Value.Check(CurrentSpecsOverviewSchema, overview)).toBe(true);
  });
});
