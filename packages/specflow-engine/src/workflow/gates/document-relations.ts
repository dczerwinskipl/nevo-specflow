import type { DocumentGate, WorkflowStep } from '../definitions/model';
import type { WorkflowSubject } from '../state/model';
import { entryGatesOf, evaluateDocumentGate, gateScope, type GateScopeRef } from './evaluate';
import type { GateDocuments } from './read';

/**
 * How the workflow uses one document now (A6 "relation"): `needed-to-finish` (an unmet exit gate of
 * the step the run is at), `needed-to-start` (an unmet entry gate of the step it certainly goes to
 * next; it does not block now) or `used` (a satisfied gate of either).
 */
export type DocumentRelationKind = 'needed-to-finish' | 'needed-to-start' | 'used';

export interface DocumentRelation {
  /** The Specification or the Task whose registry holds the document. */
  readonly scope: GateScopeRef;
  readonly documentId: string;
  readonly relation: DocumentRelationKind;
  /** The gate's step; `active`: the step the run is at. */
  readonly step: { readonly id: string; readonly title: string; readonly active: boolean };
  readonly gate: {
    readonly id: string;
    readonly label: string;
    readonly missingSections?: readonly string[];
  };
}

/**
 * The steps whose gates are read: the step the run is at (`active`, its exit gates) and the step it
 * certainly goes to next (`next`, its entry gates). Either may be absent; a wait step has no gates.
 */
export interface RelationSteps {
  readonly active?: WorkflowStep;
  readonly next?: WorkflowStep;
}

const STRENGTH: Readonly<Record<DocumentRelationKind, number>> = {
  'needed-to-finish': 0,
  'needed-to-start': 1,
  used: 2,
};

/**
 * One relation per document the gates of `steps` name, read with the same evaluation a start or a
 * finish checks (`evaluateDocumentGate`). A gate names the document that satisfies it, the closest
 * one (`sections-missing`) or the unreadable one; a gate that found no file (`file-missing`) names
 * every registered document of its type in its scope, and one that found none (`no-document`) names
 * nothing. A document named by several gates keeps the strongest relation, then the first gate:
 * the active step's before the next step's, each in declared order. Reads only.
 */
export async function documentRelationsOf(
  documents: GateDocuments,
  subject: WorkflowSubject,
  steps: RelationSteps,
): Promise<DocumentRelation[]> {
  const chosen = new Map<string, DocumentRelation>();
  const read = async (step: WorkflowStep, active: boolean, gates: readonly DocumentGate[]) => {
    for (const gate of gates) {
      const scope = gateScope(subject, gate);
      const found = await documents.documentsOfType(scope, gate.documentType);
      const status = evaluateDocumentGate(gate, scope, found);
      const named =
        status.documentId !== undefined
          ? [status.documentId]
          : found.filter((document) => !document.present).map((document) => document.id);
      const relation: DocumentRelationKind =
        status.status === 'satisfied' ? 'used' : active ? 'needed-to-finish' : 'needed-to-start';
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
          step: { id: step.id, title: step.title, active },
          gate: {
            id: status.id,
            label: status.label,
            ...(status.missingSections !== undefined
              ? { missingSections: status.missingSections }
              : {}),
          },
        });
      }
    }
  };

  if (steps.active?.kind === 'work') {
    await read(steps.active, true, steps.active.annotations.exitGates ?? []);
  }

  if (steps.next?.kind === 'work') {
    await read(steps.next, false, entryGatesOf(steps.next));
  }

  return [...chosen.values()];
}
