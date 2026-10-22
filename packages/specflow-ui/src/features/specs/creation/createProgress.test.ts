import { describe, expect, it } from 'vitest';
import { createSpecFlowI18n } from '../../../i18n';
import { translateMessage, type Message } from '../../../i18n/message';
import { createCompletedSteps, createNeutralProgress, createProgressSteps } from './createProgress';

const i18n = createSpecFlowI18n('en');
const t = (value: Message) => translateMessage(i18n.t, value);
const words = (steps: ReturnType<typeof createProgressSteps>) =>
  steps.map((step) => [
    t(step.label),
    step.description ? t(step.description) : undefined,
    step.status,
  ]);

describe('Create progress copy', () => {
  it('says each step in user language: done and running describe, pending waits', () => {
    expect(
      words(
        createProgressSteps([
          { id: 'reserving', status: 'done' },
          { id: 'preparing-workspace', status: 'running' },
          { id: 'writing-specification', status: 'pending' },
          { id: 'registering', status: 'pending' },
        ]),
      ),
    ).toEqual([
      ['Reserving the name', 'Name and branch reserved', 'done'],
      ['Preparing the workspace', 'Creating the working environment', 'running'],
      ['Creating the specification', 'Waiting for previous step', 'pending'],
      ['Finishing setup', 'Waiting for previous step', 'pending'],
    ]);
  });

  it('omits skipped steps (an existing workspace has no workspace step)', () => {
    const steps = createProgressSteps([
      { id: 'reserving', status: 'done' },
      { id: 'preparing-workspace', status: 'skipped' },
      { id: 'writing-specification', status: 'running' },
    ]);
    expect(steps.map((step) => step.id)).toEqual(['reserving', 'writing-specification']);
  });

  it('draws a step id this build does not know generically instead of dropping it', () => {
    const steps = createProgressSteps([
      { id: 'reserving', status: 'done' },
      { id: 'committing-specification', status: 'running' },
    ]);
    expect(words(steps)[1]).toEqual(['Next step', 'In progress', 'running']);
    expect(steps[1]?.id).toBe('committing-specification');
  });

  it('every known step has a title and a running and a done line in both languages', () => {
    for (const lang of ['en', 'pl'] as const) {
      const catalogue = createSpecFlowI18n(lang);
      for (const id of [
        'reserving',
        'preparing-workspace',
        'writing-specification',
        'registering',
      ]) {
        for (const part of ['title', 'running', 'done'])
          expect(catalogue.exists(`create.progress.steps.${id}.${part}`)).toBe(true);
      }
    }
  });

  it('a finished Create shows every step done, the workspace step only for a new workspace', () => {
    expect(createCompletedSteps({ kind: 'new-worktree' }).map((s) => s.id)).toEqual([
      'reserving',
      'preparing-workspace',
      'writing-specification',
      'registering',
    ]);
    expect(createCompletedSteps(undefined).map((s) => s.id)).not.toContain('preparing-workspace');
  });

  it('the neutral row never lists steps and says when the live stream is unavailable', () => {
    expect(createNeutralProgress(false).description?.key).toBe(
      'create.progress.neutral.description',
    );
    expect(createNeutralProgress(true).description?.key).toBe(
      'create.progress.neutral.descriptionLost',
    );
  });
});
