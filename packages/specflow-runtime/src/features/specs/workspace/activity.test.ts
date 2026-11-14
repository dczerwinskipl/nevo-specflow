import { describe, expect, it } from 'vitest';

import type { SpecificationWorkspaceResponse } from '@nevo/specflow-contracts/specs/workspace';

import { WORKSPACE_ACTIVITY_LIMIT, composeWorkspaceActivity, isCalendarDate } from './activity';
import { authorizeSessionReferences } from './authorize-projection';

function items(result: ReturnType<typeof composeWorkspaceActivity>) {
  if (result.state !== 'available') {
    throw new Error('activity must be available');
  }

  return result.data.items;
}

describe('composeWorkspaceActivity', () => {
  it('emits Session started events bound to their Session and the created date as a calendar day', () => {
    const events = items(
      composeWorkspaceActivity({
        created: '2026-11-08',
        sessionStarts: [
          { sessionId: 'session-a', title: 'Przygotowanie', createdAt: '2026-11-08T09:00:00.000Z' },
          { sessionId: 'session-b', createdAt: '2026-11-07T23:30:00.000Z' },
        ],
      }),
    );

    expect(events).toEqual([
      {
        id: 'session-started.session-a',
        occurredAt: '2026-11-08T09:00:00.000Z',
        kind: 'session',
        event: 'session_started',
        title: 'Przygotowanie',
        description: 'Session started',
        targetId: 'session-a',
        relatedSessionId: 'session-a',
      },
      // Same day as the Session above: the date-only event sorts as the start of that day.
      {
        id: 'specification-created',
        occurredAt: '2026-11-08',
        kind: 'info',
        event: 'specification_created',
        title: 'Specification created',
        description: '',
      },
      // An untitled Session gets no invented title.
      expect.objectContaining({ id: 'session-started.session-b', title: '' }),
    ]);
  });

  it('emits the created event only for a valid YYYY-MM-DD date', () => {
    for (const created of ['2026-11-08T10:00:00Z', '8.11.2026', '2026-02-30', '2026-13-01', '']) {
      expect(items(composeWorkspaceActivity({ created, sessionStarts: [] }))).toEqual([]);
    }

    expect(items(composeWorkspaceActivity({ sessionStarts: [] }))).toEqual([]);
  });

  it('stays available with only the created event when no Session facts exist (Sessions disabled)', () => {
    expect(composeWorkspaceActivity({ created: '2026-01-31', sessionStarts: [] })).toEqual({
      state: 'available',
      data: { items: [expect.objectContaining({ id: 'specification-created' })] },
    });
  });

  it('cuts to the newest 50 events after authorization, so hidden Sessions never shorten it', () => {
    const sessionStarts = Array.from({ length: 100 }, (_, index) => ({
      sessionId: 'session-' + index,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    }));
    const composed = composeWorkspaceActivity({ created: '2025-12-31', sessionStarts });
    // Composition keeps every event, newest first.
    expect(items(composed)).toHaveLength(101);
    expect(items(composed)[0]?.id).toBe('session-started.session-99');

    const response = {
      revision: 'r',
      workspaceId: '0b8f1c1e-0a11-4c6e-9a01-000000000001',
      specification: { id: 's', title: 'S', summary: '', preparationState: 'empty', attention: [] },
      sections: {
        tasks: { state: 'unavailable', reason: 'not_implemented' },
        documents: { state: 'unavailable', reason: 'not_implemented' },
        sessions: { state: 'unavailable', reason: 'source_unavailable' },
        activity: composed,
        repository: { state: 'unavailable', reason: 'not_implemented' },
        changes: { state: 'unavailable', reason: 'not_implemented' },
      },
      actions: {
        executeTasks: { available: false },
        startSession: { available: false },
      },
    } satisfies SpecificationWorkspaceResponse;
    // The caller may view only the even Sessions: 50 of them remain, plus the created event.
    const visible = authorizeSessionReferences(response, (id) => Number(id.split('-')[1]) % 2 === 0)
      .sections.activity;

    expect(visible.state === 'available' && visible.data.items).toHaveLength(
      WORKSPACE_ACTIVITY_LIMIT,
    );
    expect(visible.state === 'available' && visible.data.items[0]?.id).toBe(
      'session-started.session-98',
    );
  });
});

describe('isCalendarDate', () => {
  it('accepts real dates only', () => {
    expect(isCalendarDate('2024-02-29')).toBe(true);
    expect(isCalendarDate('2025-02-29')).toBe(false);
    expect(isCalendarDate('2026-1-01')).toBe(false);
  });
});
