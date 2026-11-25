import { describe, expect, it } from 'vitest';

import { AGENT_COMMAND_USAGE, AGENT_COMMANDS } from '@nevo/specflow-contracts/runtime';
import { deriveAgentScope } from '@nevo/specflow-engine';

import { readOperations, writeOperations } from './operations';

const scope = deriveAgentScope({ kind: 'ad-hoc', specId: 'S1' });
const form = { specId: 'S1' };

describe('brief operations', () => {
  it('lists exactly the writes the scope admits, from the shared command table', () => {
    const listed = writeOperations(scope, form).map((operation) => operation.path);

    expect(listed).toEqual(
      scope.operations.map((operation) =>
        Object.keys(AGENT_COMMANDS).find((key) => AGENT_COMMANDS[key]?.operation === operation),
      ),
    );
    expect(listed.every((path) => AGENT_COMMANDS[path]?.placement === 'brokered')).toBe(true);
    expect(
      readOperations(form).every((entry) => AGENT_COMMANDS[entry.path]?.placement === 'read'),
    ).toBe(true);
  });

  it('lists only the classify write for a classify-only scope', () => {
    const narrowed = { ...scope, operations: ['documents.classify'] as const };

    expect(writeOperations(narrowed, form).map((operation) => operation.path)).toEqual([
      'specs documents classify',
    ]);
  });

  it('explains each option a form names with the meaning the CLI program declares', () => {
    const finish = writeOperations(
      { ...scope, operations: ['workflow.finish'] as const },
      { specId: 'S1', attempt: { step: 'breakdown', attempt: 1 }, results: [] },
    )[0]!;
    const meaning = (flag: string) =>
      AGENT_COMMAND_USAGE['workflow finish']!.options.find((option) => option.long === flag)!
        .description;

    expect(finish.options).toContainEqual({
      flags: '--tasks-file <path>',
      description: meaning('--tasks-file'),
    });
    expect(finish.options.map((option) => option.flags)).not.toContain('--project-root <path>');
    expect(meaning('--tasks-file')).not.toBe('');
  });

  it('adds --task for a Task subject and --template only with template ids', () => {
    const task = writeOperations(scope, { specId: 'S1', taskId: 'T1', templateIds: ['t'] }).map(
      (operation) => operation.form,
    );
    expect(task.every((text) => text.includes('--task T1'))).toBe(true);
    expect(task.join('\n')).not.toContain('--template');
    expect(writeOperations(scope, form)[0]!.form).not.toContain('--template');
    expect(writeOperations(scope, { ...form, templateIds: ['t'] })[0]!.form).toContain(
      '--template',
    );
  });
});
