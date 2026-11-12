import { describe, expect, it } from 'vitest';

import { localOwner } from '../local-actor';
import { editTaskInput, type EditOptions } from './edit-input';

const actor = localOwner('tester');
const edit = (
  options: Partial<EditOptions>,
  context?: Parameters<typeof editTaskInput>[0]['context'],
) =>
  editTaskInput({
    specId: 's',
    taskId: 't',
    options: { expectedRevision: 'r1', dependsOn: [], dependencies: true, ...options },
    context,
    actor,
  });

describe('editTaskInput', () => {
  it('leaves everything unchanged when no field is named', () => {
    expect(edit({})).toEqual({ specId: 's', taskId: 't', expectedRevision: 'r1', actor });
  });

  it('maps --clear-summary to a null summary and --summary to the text', () => {
    expect(edit({ clearSummary: true })).toMatchObject({ summary: null });
    expect(edit({ summary: 'New' })).toMatchObject({ summary: 'New' });
  });

  it('maps --no-dependencies to an empty list and --depends-on to the list', () => {
    expect(edit({ dependencies: false })).toMatchObject({ dependsOn: [] });
    expect(edit({ dependsOn: ['a', 'b'] })).toMatchObject({ dependsOn: ['a', 'b'] });
  });

  it('maps --default-context to a null context and entries to the whole list', () => {
    expect(edit({ defaultContext: true })).toMatchObject({ context: null });
    const entries = [{ kind: 'path', path: 'src', required: true }] as const;
    expect(edit({}, [...entries])).toMatchObject({ context: entries });
  });
});
