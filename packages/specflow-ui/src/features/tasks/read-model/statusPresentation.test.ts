import { describe, expect, it } from 'vitest';
import {
  getTaskStatePresentation,
  TASK_STATUS_IDS,
  taskStatusSupporting,
} from './statusPresentation';

describe('Task status presentation', () => {
  it('maps every presented status to one mark and tone', () => {
    const marks = Object.fromEntries(
      TASK_STATUS_IDS.map((id) => {
        const presentation = getTaskStatePresentation(id);

        return [id, [presentation.icon ?? presentation.indicator ?? null, presentation.tone]];
      }),
    );

    expect(marks).toEqual({
      draft: ['edit', 'neutral'],
      ready: ['info', 'info'],
      waiting: ['clock', 'neutral'],
      'in-progress': ['loader', 'info'],
      'on-hold': ['circle-pause', 'neutral'],
      blocked: [null, 'neutral'],
      completed: ['circle-check', 'success'],
      cancelled: ['close', 'neutral'],
      abandoned: ['close', 'neutral'],
      broken: ['circle-alert', 'danger'],
    });
  });

  it('spins the In progress loader like the DS spinner, static under reduced motion', () => {
    expect(getTaskStatePresentation('in-progress').iconClassName).toContain(
      'animate-spin motion-reduce:animate-none',
    );
  });

  it('keeps the label neutral except for danger, and never uses the attention tone', () => {
    const lines = TASK_STATUS_IDS.map((id) => taskStatusSupporting(id, id));

    expect(lines.filter((line) => line.tone).map((line) => [line.text, line.tone])).toEqual([
      ['broken', 'danger'],
    ]);
    expect(TASK_STATUS_IDS.some((id) => getTaskStatePresentation(id).tone === 'attention')).toBe(
      false,
    );
    expect(taskStatusSupporting('ready', 'Ready')).toEqual({ text: 'Ready', indicator: 'info' });
    expect(taskStatusSupporting('cancelled', 'Cancelled').textClassName).toBe('text-content-muted');
  });

  it('reads an unknown status as its label alone', () => {
    expect(taskStatusSupporting('something-new', 'Something new')).toEqual({
      text: 'Something new',
    });
  });
});
