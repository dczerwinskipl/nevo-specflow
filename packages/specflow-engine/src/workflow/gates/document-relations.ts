import type { DocumentGate, WorkStep, WorkflowStep } from '../definitions/model';
import type { WorkflowSubject } from '../state/model';
import {
  entryGatesOf,
  evaluateDocumentGate,
  exitGatesFor,
  gateScope,
  type GateScopeRef,
} from './evaluate';
import type { GateDocuments } from './read';

/**
 * How the workflow uses one document now (A6 "relation"): `needed-to-finish` (an unmet exit gate of
 * the step the run is at that applies to every way of finishing it), `needed-to-start` (an unmet
 * entry gate of the step it goes to next) or `used` (a satisfied gate of either).
 */
export type DocumentRelationKind = 'needed-to-finish' | 'needed-to-start' | 'used';

export interface DocumentRelation {
  /** The Specification or the Task whose registry holds the document. */
  readonly scope: GateScopeRef;
  readonly documentId: string;
  readonly relation: DocumentRelationKind;
  /**
   * The unmet gate refuses the action the run waits for now: the finish of the active step, or the
   * start of the next step when no step is active. Always false for `used`.
   */
  readonly blocksNow: boolean;
  /** The gate's step; `active`: the step the run is at. */
  readonly step: { readonly id: string; readonly title: string; readonly active: boolean };
  readonly gate: {
    readonly id: string;
    readonly label: string;
    readonly labelDeclared: boolean;
    readonly documentType: string;
    readonly requiredSections: readonly string[];
    readonly missingSections?: readonly string[];
  };
}

/**
 * The steps whose gates are read: the step the run is at (`active`, its exit gates) and the step it
 * goes to next (`next`, its entry gates; `startsNow` when no step is active and a start would
 * activate it). Either may be absent; a wait step has no gates.
 */
export interface RelationSteps {
  readonly active?: WorkflowStep;
  readonly next?: { readonly step: WorkflowStep; readonly startsNow: boolean };
}

const STRENGTH: Readonly<Record<DocumentRelationKind, number>> = {
  'needed-to-finish': 0,
  'needed-to-start': 1,
  used: 2,
};

/** Whether an exit gate applies to every transition of its step (no `when`, or one covering all). */
function appliesToEveryFinish(step: WorkStep, gate: DocumentGate): boolean {
  return step.transitions.every((transition) =>
    exitGatesFor(step, transition.result).some((applying) => applying.id === gate.id),
  );
}

/**
 * One relation per document the gates of `steps` name, read with the same evaluation a start or a
 * finish checks (`evaluateDocumentGate`). A gate names the document that satisfies it, the closest
 * one (`sections-missing`) or the unreadable one; a gate that found no file (`file-missing`) names
 * every registered document of its type in its scope, and one that found none (`no-document`) names
 * nothing. An exit gate that applies only to some results (`when`) is not needed to finish: unmet
 * it relates nothing, satisfied it is `used`. A document named by several gates keeps the strongest
 * relation, then the first gate: the active step's before the next step's, each in declared order.
 * Reads only.
 */
export async function documentRelationsOf(
  documents: GateDocuments,
  subject: WorkflowSubject,
  steps: RelationSteps,
): Promise<DocumentRelation[]> {
  const chosen = new Map<string, DocumentRelation>();
  const read = async (
    step: WorkflowStep,
    phase: 'exit' | 'start-later' | 'start-now',
    gates: readonly DocumentGate[],
  ) => {
    for (const gate of gates) {
      const conditional =
        phase === 'exit' && step.kind === 'work' && !appliesToEveryFinish(step, gate);
      const scope = gateScope(subject, gate);
      const found = await documents.documentsOfType(scope, gate.documentType);
      const status = evaluateDocumentGate(gate, scope, found);
      if (status.status === 'unsatisfied' && conditional) {
        continue;
      }

      const named =
        status.documentId !== undefined
          ? [status.documentId]
          : found.filter((document) => !document.present).map((document) => document.id);
      const relation: DocumentRelationKind =
        status.status === 'satisfied'
          ? 'used'
          : phase === 'exit'
            ? 'needed-to-finish'
            : 'needed-to-start';
      for (const documentId of named) {
        const key = JSON.stringify([scope.kind === 'task' ? scope.taskId : null, documentId]);
        const held = chosen.get(key);
        if (held !== undefined && STRENGTH[held.relation] <= STRENGTH[relation]) {
          continue;
        }

        chosen.set(key, {
          scope,
          documentId,
          relation,
          blocksNow: relation !== 'used' && phase !== 'start-later',
          step: { id: step.id, title: step.title, active: phase === 'exit' },
          gate: {
            id: status.id,
            label: status.label,
            labelDeclared: status.labelDeclared,
            documentType: status.documentType,
            requiredSections: status.requiredSections,
            ...(status.missingSections !== undefined
              ? { missingSections: status.missingSections }
              : {}),
          },
        });
      }
    }
  };

  if (steps.active?.kind === 'work') {
    await read(steps.active, 'exit', steps.active.annotations.exitGates ?? []);
  }

  const next = steps.next;
  if (next?.step.kind === 'work') {
    await read(next.step, next.startsNow ? 'start-now' : 'start-later', entryGatesOf(next.step));
  }

  return [...chosen.values()];
}
