import { describe, expect, it } from 'vitest';
import { createSpecFlowI18n } from '../../../i18n';
import {
  taskAttentionOverlay,
  taskRequiresAttention,
  type TaskAttentionSource,
} from './attentionOverlay';

const en = createSpecFlowI18n('en').t;
const pl = createSpecFlowI18n('pl').t;
const text = (source: TaskAttentionSource, t = en) => taskAttentionOverlay(source, t)?.text;

describe('Task attention overlay', () => {
  it('adds nothing without an Engine report, whatever the status', () => {
    expect(taskAttentionOverlay({}, en)).toBeUndefined();
    expect(taskRequiresAttention({ feedback: 'Waiting for IT.' })).toBe(false);
    expect(taskRequiresAttention({ item: { reason: 'on-hold-blocking' } })).toBe(true);
    expect(taskRequiresAttention({ blocksSpecification: true })).toBe(true);
    expect(taskRequiresAttention({ broken: true })).toBe(true);
  });

  it('words an escalation with its feedback where the surface has it', () => {
    const item = { reason: 'task-escalated', message: 'It escalated.' };

    expect(text({ item, feedback: 'Which provider?' })).toBe(
      'Requires attention · escalated to the specification: Which provider?',
    );
    expect(text({ item })).toBe('Requires attention · escalated to the specification');
  });

  it('names what a held Task holds up, the step finish first', () => {
    const held = (blocks: { taskIds?: string[]; finish?: string }, stepTitle?: string) =>
      text({
        item: {
          reason: 'on-hold-blocking',
          message: 'It is on hold.',
          blocks,
          ...(stepTitle ? { stepTitle } : {}),
        },
      });

    expect(held({ taskIds: ['T-02', 'T-03'] })).toBe('Requires attention · holds up T-02, T-03');
    expect(held({ taskIds: ['T-02', 'T-03', 'T-04', 'T-05'] })).toBe(
      'Requires attention · holds up T-02, T-03 (+2)',
    );
    expect(held({ finish: 'breakdown' }, 'Breakdown')).toBe(
      'Requires attention · Breakdown cannot finish while this task is on hold',
    );
    expect(held({ taskIds: ['T-02'], finish: 'breakdown' }, 'Breakdown')).toBe(
      'Requires attention · Breakdown cannot finish while this task is on hold',
    );
    expect(held({ finish: 'breakdown' })).toBe(
      'Requires attention · the step cannot finish while this task is on hold',
    );
  });

  it("names the Specification its tasks-stuck keeps waiting, and keeps other reasons' message", () => {
    expect(text({ blocksSpecification: true, specificationTitle: 'Single sign-on' })).toBe(
      'Requires attention · Single sign-on cannot continue until it moves',
    );
    expect(text({ blocksSpecification: true })).toBe(
      'Requires attention · the specification cannot continue until it moves',
    );
    expect(text({ item: { reason: 'context-unresolved', message: 'Cannot start: …' } })).toBe(
      'Requires attention · Cannot start: …',
    );
  });

  it('adds no line for broken files (the status says it), the attention tone otherwise', () => {
    expect(taskAttentionOverlay({ broken: true }, en)).toBeUndefined();
    expect(
      taskAttentionOverlay(
        { broken: true, item: { reason: 'task-broken', message: 'Broken.' } },
        en,
      ),
    ).toBeUndefined();
    expect(
      taskAttentionOverlay(
        { item: { reason: 'on-hold-blocking', blocks: { taskIds: ['T-02'] } } },
        en,
      ),
    ).toMatchObject({ icon: 'triangle-alert', tone: 'attention' });
  });

  it('has Polish copy', () => {
    expect(text({ item: { reason: 'on-hold-blocking', blocks: { taskIds: ['T-02'] } } }, pl)).toBe(
      'Wymaga uwagi · wstrzymuje T-02',
    );
  });
});
