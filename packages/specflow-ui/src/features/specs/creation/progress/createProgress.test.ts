import { describe, expect, it } from 'vitest';
import { createSpecFlowI18n } from '../../../../i18n';
import { translateMessage, type Message } from '../../../../i18n/message';
import {
  createCompletedSteps,
  createNeutralProgress,
  createProgressSteps,
  createRunningStepTitle,
} from './createProgress';

const i18n = createSpecFlowI18n('en');
const t = (value: Message) => translateMessage(i18n.t, value);
const words = (steps: ReturnType<typeof createProgressSteps>) =>
  steps.map((step) => [
    t(step.label),
    step.description ? t(step.description) : undefined,
    step.status,
  ]);

describe('Create progress copy', () => {
  it('says each step in user language: done and running describe, pending is only its muted title', () => {
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
      ['Creating the specification', undefined, 'pending'],
      ['Finishing setup', undefined, 'pending'],
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
      { id: 'future-step', status: 'running' },
    ]);
    expect(words(steps)[1]).toEqual(['Next step', 'In progress', 'running']);
    expect(steps[1]?.id).toBe('future-step');
  });

  it('every known step has a title and a running and a done line in both languages', () => {
    for (const lang of ['en', 'pl'] as const) {
      const catalogue = createSpecFlowI18n(lang);
      for (const id of [
        'reserving',
        'preparing-workspace',
        'writing-specification',
        'committing-specification',
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

  it('names the commit step and lists it only when the Engine commits the scaffold', () => {
    expect(
      words(createProgressSteps([{ id: 'committing-specification', status: 'running' }])),
    ).toEqual([
      ['Saving the specification in Git', 'Committing the specification files', 'running'],
    ]);
    expect(createCompletedSteps({ kind: 'new-worktree' }, true).map((s) => s.id)).toEqual([
      'reserving',
      'preparing-workspace',
      'writing-specification',
      'committing-specification',
      'registering',
    ]);
    expect(
      createCompletedSteps({ kind: 'existing', workspaceId: 'w' }, true).map((s) => s.id),
    ).toEqual(['reserving', 'writing-specification', 'committing-specification', 'registering']);
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

describe('Create running step title', () => {
  it('names the step that is running, and nothing while none is', () => {
    const running = createRunningStepTitle([
      { id: 'reserving', status: 'done' },
      { id: 'preparing-workspace', status: 'running' },
      { id: 'registering', status: 'pending' },
    ]);
    expect(running && t(running)).toBe('Preparing the workspace');
    expect(createRunningStepTitle([])).toBeUndefined();
    expect(createRunningStepTitle([{ id: 'reserving', status: 'pending' }])).toBeUndefined();
  });
});
