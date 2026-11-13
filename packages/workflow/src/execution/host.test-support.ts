import type { WorkflowDefinition } from '../definitions/definition';
import { assertPinned } from '../definitions/revision';
import { decide, type WorkflowCommand } from './coordinator';
import { assertPositionJustified } from './replay';
import { newRun, type WorkflowRun } from './run';

/**
 * A minimal host for tests: it owns the keys and the storage, the kernel owns the decisions. Runs
 * of one definition live in a `Map<runKey, serialized Run>` the kernel never sees; a host key is
 * opaque to it. Persisting is serialize -> parse, so `reload` proves a Run is plain data the kernel
 * can validate and continue.
 */
export function createTestHost(definition: WorkflowDefinition) {
  const stored = new Map<string, string>();

  const read = (key: string): WorkflowRun => {
    const text = stored.get(key);
    if (text === undefined) {
      throw new Error(`No run stored under "${key}".`);
    }

    return JSON.parse(text) as WorkflowRun;
  };

  return {
    /** Create a Run under a host key (the first start of that subject). */
    begin(key: string): void {
      stored.set(key, JSON.stringify(newRun(definition)));
    },
    /** Decide one command on the stored Run and persist the result. */
    apply(key: string, command: WorkflowCommand) {
      const decision = decide(definition, read(key), command);
      stored.set(key, JSON.stringify(decision.nextRun));

      return decision;
    },
    /** Load a stored Run the way a restarted host would: validate pin and recorded history. */
    reload(key: string): WorkflowRun {
      const run = read(key);
      assertPinned(run.workflow, definition);
      assertPositionJustified(run, definition);

      return run;
    },
  };
}
