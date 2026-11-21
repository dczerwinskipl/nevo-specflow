import { activeAttempt, WorkflowError as CoreWorkflowError } from '@nevo/workflow';

import { loadSubject } from '../../operations/loaded-execution';
import type { ExpectedPosition } from '../../operations/start';
import { agentAttemptBindingOf, type WorkflowSubject } from '../../state/model';
import type { AgentAttemptDependencies } from '../dependencies';
import {
  assertBaselineUnchanged,
  assertCleanBaseline,
  assertDeclaredPathsShape,
  assertFinishAttribution,
  type AttributionFacts,
} from './attribution';

export {
  AttributionRefusalError,
  type AttributionArea,
  type AttributionDetails,
  type AttributionFacts,
  type DirtyPathFact,
} from './attribution';

/** The changed files an agent finish proposal declares (`changes.paths`, B3 rule 4). */
export interface AgentDeclaredChanges {
  readonly paths: readonly string[];
}

export interface AgentTurnAdmissionInput {
  readonly subject: WorkflowSubject;
  readonly workspaceId: string;
  /** The position the Turn works on: a new attempt of `step`, or (Continue) `step#attempt`. */
  readonly expected: ExpectedPosition;
}

/**
 * The baseline admission of an agent Turn's dispatch (B3 rules 1 and 2): for a new attempt, or one
 * none of whose Turns settled yet, the checkout must be clean but for the Engine's own uncommitted
 * writes (`WORKFLOW_DIRTY_BASELINE`); for Continue, nothing outside them may have changed since the
 * dirty set recorded when the previous Turn settled (`WORKFLOW_BASELINE_CHANGED`; no record while Git
 * is on refuses). With Git off nothing is checked. A position that is not the active attempt is left
 * to the start, which refuses it.
 *
 * Read-only and lock-free: `startAgentAttempt` runs it inside its section before anything is
 * written, and the Runtime calls it again at the dispatch, while the Turn's claim is held and before
 * the provider process exists.
 */
export async function admitAgentTurn(
  dependencies: Pick<AgentAttemptDependencies, 'boundary' | 'journal' | 'workflow'>,
  input: AgentTurnAdmissionInput,
): Promise<void> {
  const facts = await dependencies.boundary.facts(input.workspaceId);
  if (facts === undefined) {
    return;
  }

  if (input.expected.attempt === undefined) {
    assertCleanBaseline(facts);

    return;
  }

  const { workflow } = dependencies;
  let attemptId: string | undefined;
  try {
    const snapshot = await workflow.store.read(input.subject.specId);
    const run = loadSubject(workflow.catalogue, snapshot, input.subject).run;
    const position = run.position;
    attemptId =
      position.state === 'active' &&
      position.step === input.expected.step &&
      position.attempt === input.expected.attempt
        ? agentAttemptBindingOf(activeAttempt(run))?.attemptId
        : undefined;
  } catch (error) {
    // The start judges a subject or position it cannot load, with its own refusal.
    if (error instanceof CoreWorkflowError) {
      return;
    }

    throw error;
  }

  if (attemptId === undefined) {
    return;
  }

  const journal = await dependencies.journal.read(attemptId);
  if (!journal?.turns.some((turn) => turn.finalizedAt !== undefined)) {
    assertCleanBaseline(facts);

    return;
  }

  assertBaselineUnchanged(facts, journal.dirtySet);
}

/**
 * The attribution checks of an agent finish (B6, B3 rules 3 and 4) on the attempt's checkout now:
 * at submission (`proposeAgentFinish`) and again at the finalize re-validation. The declared paths'
 * shape is checked first and always; with Git off nothing else is. Returns the facts it judged
 * (`undefined` with Git off): the finalize records the declared paths' hashes from them.
 */
export async function assertAgentFinishAttribution(
  dependencies: Pick<AgentAttemptDependencies, 'boundary'>,
  workspaceId: string,
  changes: AgentDeclaredChanges | undefined,
): Promise<AttributionFacts | undefined> {
  const declared = changes?.paths ?? [];
  assertDeclaredPathsShape(declared);
  const facts = await dependencies.boundary.facts(workspaceId);
  if (facts !== undefined) {
    assertFinishAttribution(facts, declared);
  }

  return facts;
}
