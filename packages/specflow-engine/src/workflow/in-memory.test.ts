import { describe, expect, it } from 'vitest';

import { createExecutionCatalogue } from './definitions/catalogue';
import { loadShippedExecutionEntities, openInMemoryWorkflow } from './in-memory';
import { inspectActions } from './operations/actions';
import { finishStep } from './operations/finish';
import { fakeReferences } from './operations/operations.test-support';
import { startSpecificationExecution } from './operations/start';
import type { OwnerActor } from './state/model';

const owner: OwnerActor = { class: 'human', details: { actorId: 'demo:owner', trust: 'local' } };

describe('openInMemoryWorkflow', () => {
  it('runs the real operations over the shipped definitions, with Close and Abandon projected', async () => {
    const workflow = openInMemoryWorkflow({
      catalogue: createExecutionCatalogue(await loadShippedExecutionEntities()),
      references: fakeReferences(),
      now: () => new Date('2026-11-16T10:00:00.000Z'),
    });
    const subject = { kind: 'specification', specId: 'demo' } as const;

    const started = await startSpecificationExecution(workflow, {
      specId: 'demo',
      archetype: 'feature',
      actor: owner,
    });
    if (started.kind === 'terminal') {
      throw new Error('The Specification ended at its start.');
    }

    await finishStep(workflow, {
      subject,
      step: started.context.step.id,
      attempt: started.context.attempt,
      input: {},
      actor: owner,
    });
    const projection = await inspectActions(workflow, subject);

    expect(projection.position).toMatchObject({
      kind: 'ready',
      next: { step: { id: 'specification' } },
    });
    // No checkout to archive in: Close is unavailable before anyone tries; Abandon is the Engine's.
    expect(projection.specification?.exit).toEqual({
      close: { kind: 'unavailable', reason: 'no-repository' },
      abandon: { kind: 'allowed' },
    });
  });
});
