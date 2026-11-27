import { describe, expect, it } from 'vitest';

import type { CurrentSpecRecord } from '../repository/model';
import { classifyCurrentSpec } from './classify-spec';

function spec(overrides: Partial<CurrentSpecRecord> = {}): CurrentSpecRecord {
  return {
    id: 'spec',
    title: 'Spec',
    updatedAt: '2026-10-01T12:00:00Z',
    progress: { completed: 0, total: 1 },
    workflow: { kind: 'not-started' },
    signals: [],
    currentExecutions: [],
    ...overrides,
  };
}

describe('Current Specs Overview classification', () => {
  it('prioritizes the highest-priority attention signal over active execution', () => {
    expect(
      classifyCurrentSpec(
        spec({
          signals: [
            {
              id: 'review',
              kind: 'attention',
              label: 'Review',
              attentionReason: 'review',
              priority: 10,
              target: { kind: 'specification', specId: 'spec' },
            },
            {
              id: 'decision',
              kind: 'attention',
              label: 'Decision',
              attentionReason: 'decision',
              count: 2,
              priority: 20,
              target: { kind: 'specification', specId: 'spec' },
            },
          ],
          currentExecutions: [
            { sessionId: 'session', agentRole: 'Implementer', taskIds: ['TASK-1'] },
          ],
        }),
      ),
    ).toEqual({ section: 'requires-attention', reason: 'decision', count: 2 });
  });

  it('keeps human attention dominant even when its semantic reason is not classified yet', () => {
    expect(
      classifyCurrentSpec(
        spec({
          signals: [
            {
              id: 'unknown-attention',
              kind: 'attention',
              label: 'Human input required',
              priority: 30,
              target: { kind: 'specification', specId: 'spec' },
            },
          ],
          currentExecutions: [
            { sessionId: 'session', agentRole: 'Implementer', taskIds: ['TASK-1'] },
          ],
        }),
      ),
    ).toEqual({ section: 'requires-attention' });
  });

  it('classifies a Session execution as in progress when no attention requires the human', () => {
    expect(
      classifyCurrentSpec(
        spec({
          currentExecutions: [
            { sessionId: 'session', agentRole: 'Implementer', taskIds: ['TASK-1'] },
          ],
        }),
      ),
    ).toEqual({ section: 'in-progress' });
  });

  it('does not guess a section when the workflow or the execution evidence is unknown', () => {
    expect(
      classifyCurrentSpec(spec({ workflow: null, signals: null, currentExecutions: null })),
    ).toEqual({ section: 'unknown' });
    expect(classifyCurrentSpec(spec({ workflow: null }))).toEqual({ section: 'unknown' });
    expect(classifyCurrentSpec(spec({ currentExecutions: null }))).toEqual({ section: 'unknown' });
  });

  it.each([
    [{ kind: 'not-started' }, 'not-started'],
    [{ kind: 'step', state: 'active', actor: 'agent' }, 'in-progress'],
    [{ kind: 'step', state: 'active', actor: 'human' }, 'in-progress'],
    [{ kind: 'step', state: 'ready' }, 'in-progress'],
    [
      {
        kind: 'step',
        state: 'waiting',
        tasks: { open: 5, total: 5, inProgress: 0, readyToStart: 5 },
      },
      'in-progress',
    ],
    [{ kind: 'ended', outcome: 'completed' }, 'ended'],
    [{ kind: 'ended', outcome: 'abandoned' }, 'ended'],
  ] as const)('classifies the workflow position %j as %s', (workflow, section) => {
    expect(classifyCurrentSpec(spec({ workflow }))).toEqual({ section });
  });

  it('puts the attention of a waiting workflow before its progress', () => {
    expect(
      classifyCurrentSpec(
        spec({
          workflow: { kind: 'step', state: 'waiting' },
          signals: [
            {
              id: 'workflow-attention',
              kind: 'attention',
              label: 'Requires attention',
              count: 2,
              priority: 0,
              target: { kind: 'specification', specId: 'spec' },
            },
          ],
        }),
      ),
    ).toEqual({ section: 'requires-attention', count: 2 });
  });
});
