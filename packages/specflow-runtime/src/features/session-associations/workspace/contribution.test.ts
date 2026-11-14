import { describe, expect, it } from 'vitest';
import type { SessionsRuntime } from '../../sessions';
import {
  createWorkspaceSessionContribution,
  recommendSessions,
  sessionAttentionOf,
  WORKSPACE_SESSION_LIMIT,
  workspaceSessionStatus,
} from './contribution';

describe('workspace Session section policy', () => {
  it('maps Session readiness, and only readiness, to the row status', () => {
    expect(workspaceSessionStatus('busy')).toBe('active');
    expect(workspaceSessionStatus('requiresAttention')).toBe('attention');
    expect(workspaceSessionStatus('ready')).toBe('quiet');
    expect(workspaceSessionStatus('unavailable')).toBe('unknown');
    expect(workspaceSessionStatus('authenticationRequired')).toBe('authenticationRequired');
  });

  it('recommends attention, then active, then the most recently updated Session', () => {
    const at = (minute: number) => `2026-11-08T10:${String(minute).padStart(2, '0')}:00.000Z`;
    expect(
      recommendSessions([
        { id: 'quiet-new', status: 'quiet', updatedAt: at(50) },
        { id: 'active-old', status: 'active', updatedAt: at(1) },
        { id: 'attention-old', status: 'attention', updatedAt: at(2) },
        { id: 'quiet-old', status: 'quiet', updatedAt: at(3) },
        { id: 'attention-new', status: 'attention', updatedAt: at(40) },
        { id: 'unknown-newest', status: 'unknown', updatedAt: at(59) },
      ]),
    ).toEqual([
      'attention-new',
      'attention-old',
      'active-old',
      'unknown-newest',
      'quiet-new',
      'quiet-old',
    ]);
  });

  it('lifts each Session waiting for input into Requires attention, once, with its action', () => {
    expect(
      sessionAttentionOf([
        { id: 'waiting', title: 'Login flow', status: 'attention' },
        { id: 'working', status: 'active' },
        { id: 'untitled', status: 'attention' },
      ]),
    ).toEqual([
      {
        id: 'session-attention.waiting',
        kind: 'session',
        title: 'Login flow',
        reason: 'The session waits for your input.',
        targetId: 'waiting',
        priority: 'high',
        code: 'session-input',
        actor: 'owner',
        action: 'answer-session',
      },
      expect.objectContaining({ targetId: 'untitled', title: 'Session' }),
    ]);
  });

  it('lifts a Session waiting for input beyond the section rows, and keeps its identity', async () => {
    // 103 Sessions, newest first: one waiting among the rows, one beyond the 100 the section shows.
    const total = WORKSPACE_SESSION_LIMIT + 3;
    const rows = Array.from({ length: total }, (_, index) => {
      const seq = total - index;

      return {
        projectId: 'project',
        sessionId: `s-${String(seq)}`,
        specId: 'spec',
        createdSeq: seq,
        readiness: seq === total || seq === 2 ? 'requiresAttention' : 'ready',
        updatedAt: `2026-11-14T10:00:${String(seq % 60).padStart(2, '0')}.000Z`,
      };
    });
    const call = (request: {
      op: string;
      after?: number;
      scanBudget?: number;
      sessionIds?: string[];
    }) => {
      if (request.op === 'list') {
        const after = request.after;
        const left = rows.filter((row) => after === undefined || row.createdSeq < after);

        return Promise.resolve({
          rows: left.slice(0, request.scanBudget),
          hasMore: left.length > request.scanBudget!,
        });
      }

      return Promise.resolve(
        request.sessionIds!.map((sessionId) => ({
          sessionId,
          title: `Title ${sessionId}`,
          providerId: 'fake',
          readiness: rows.find((row) => row.sessionId === sessionId)!.readiness,
          // An active Turn keeps the stored readiness without a provider catalogue.
          activeTurn: { turnId: 't' },
          createdAt: '2026-11-14T09:00:00.000Z',
          updatedAt: '2026-11-14T10:00:00.000Z',
        })),
      );
    };

    const sessions = {
      projectId: 'project',
      coordinator: { store: { call }, provider: () => undefined, usable: () => true },
    } as unknown as SessionsRuntime;
    const read = createWorkspaceSessionContribution({ sessions, projectId: () => 'project' });

    const result = await read('spec', { authz: { can: () => true } as never });

    expect(result.section).toMatchObject({ state: 'available', data: { hasMore: true } });
    const data = result.section.state === 'available' ? result.section.data : undefined;
    expect(data?.items).toHaveLength(WORKSPACE_SESSION_LIMIT);
    expect(data?.items[0]).toMatchObject({ id: `s-${String(total)}`, status: 'attention' });
    expect(data?.attention.map((item) => item.targetId)).toEqual([`s-${String(total)}`, 's-2']);
    expect(result.sessionIdentities?.map((identity) => identity.sessionId)).toContain('s-2');
  });
});
