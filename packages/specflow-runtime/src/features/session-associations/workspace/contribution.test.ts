import { describe, expect, it } from 'vitest';
import { recommendSessions, sessionAttentionOf, workspaceSessionStatus } from './contribution';

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
});
