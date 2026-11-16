import { describe, expect, it } from 'vitest';

import type { DemoSpecification } from '../../demo-catalogue';
import { buildDemoSessions } from './contribution';
import { seededDemoConversation } from './seeded-conversation';

const RUNNING = '00000000-0000-4000-8000-000000000001';
const ASKING = '00000000-0000-4000-8000-000000000002';
const REVIEW = '00000000-0000-4000-8000-000000000003';
const READY = '00000000-0000-4000-8000-000000000004';

const session = (sessionId: string) => ({ kind: 'session' as const, specId: 'spec', sessionId });
const record: DemoSpecification = {
  id: 'spec',
  title: 'Payment limits',
  progress: { completed: 0, total: 2 },
  currentExecutions: [{ sessionId: RUNNING, agentRole: 'Implementer', taskIds: ['TASK-02'] }],
  signals: [
    // An attention signal on a Session that executes Tasks: the row says active, so does the page.
    { id: 's1', kind: 'attention', label: 'Look', target: session(RUNNING) },
    {
      id: 's2',
      kind: 'attention',
      label: 'Agent asks for input',
      reason: 'Choose how queued work should behave.',
      attentionReason: 'input',
      target: session(ASKING),
    },
    {
      id: 's3',
      kind: 'attention',
      label: 'Review the plan',
      reason: 'The plan is ready for review.',
      target: session(REVIEW),
    },
    { id: 's4', kind: 'ready', label: 'Ready', target: session(READY) },
  ],
};

describe('seededDemoConversation', () => {
  it('follows the status of the list row for every seeded Session', () => {
    const status = new Map(buildDemoSessions(record).map((item) => [item.id, item.status]));
    expect(status.get(RUNNING)).toBe('active');

    const running = seededDemoConversation(record, RUNNING)!;
    expect(running.activeTurn).toMatchObject({ state: 'active' });
    expect(running.interaction).toBeUndefined();
    expect(running.entries[0]?.text.text).toBe('Implement TASK-02 of “Payment limits”.');
  });

  it('offers the choices only for a signal that asks for input', () => {
    expect(seededDemoConversation(record, ASKING)!.interaction).toMatchObject({
      kind: 'question',
      prompt: 'Choose how queued work should behave.',
      options: [{ id: 'resume' }, { id: 'replan' }],
      allowText: false,
    });

    const review = seededDemoConversation(record, REVIEW)!;
    expect(review.activeTurn).toMatchObject({ state: 'waitingForUser' });
    expect(review.interaction).toMatchObject({
      prompt: 'The plan is ready for review.',
      allowText: true,
    });
    expect(review.interaction).not.toHaveProperty('options');
  });

  it('shows the request of a quiet Session, with nothing running', () => {
    const ready = seededDemoConversation(record, READY)!;
    expect(ready.entries).toMatchObject([{ kind: 'request' }]);
    expect(ready.activeTurn).toBeUndefined();
    expect(ready.interaction).toBeUndefined();
  });

  it('has no seeded conversation for a Session the catalogue does not name', () => {
    expect(seededDemoConversation(record, '00000000-0000-4000-8000-000000000099')).toBeUndefined();
  });
});
