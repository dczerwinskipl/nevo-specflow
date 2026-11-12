import type { DocumentGate } from '../definitions/model';
import { WorkflowError } from '../errors';
import type { WorkflowSubject } from '../state/model';
import {
  evaluateDocumentGate,
  gateScope,
  type GateDocument,
  type GateScopeRef,
  type GateStatus,
} from './evaluate';

/**
 * What a gate reads: the registered documents of a type in the Specification or one of its Tasks
 * (their document registries), with each file's text. Production reads them through the Documents
 * capability (`readRegisteredDocumentsOfType`), never through the execution store.
 */
export interface GateDocuments {
  documentsOfType(scope: GateScopeRef, documentType: string): Promise<readonly GateDocument[]>;
}

/** The statuses of a step's gates for a subject, in declared order; reads only. */
export async function evaluateGates(
  documents: GateDocuments,
  subject: WorkflowSubject,
  gates: readonly DocumentGate[],
): Promise<GateStatus[]> {
  const statuses: GateStatus[] = [];
  for (const gate of gates) {
    const scope = gateScope(subject, gate);
    statuses.push(
      evaluateDocumentGate(gate, scope, await documents.documentsOfType(scope, gate.documentType)),
    );
  }

  return statuses;
}

/** `WORKFLOW_GATE_UNSATISFIED`: the start or finish is refused before anything is written. */
export class GateUnsatisfiedError extends WorkflowError {
  /** Whether the step's entry gates refused a start or its exit gates a finish. */
  readonly phase: 'entry' | 'exit';
  readonly step: string;
  /** Every unsatisfied gate, in declared order. */
  readonly gates: readonly GateStatus[];

  constructor(phase: 'entry' | 'exit', step: string, gates: readonly GateStatus[]) {
    super(
      'WORKFLOW_GATE_UNSATISFIED',
      `The step "${step}" cannot ${phase === 'entry' ? 'start' : 'finish'} yet: ${gates
        .map((gate) => `${gate.label} (${gate.reason ?? 'unsatisfied'})`)
        .join('; ')}.`,
    );
    this.phase = phase;
    this.step = step;
    this.gates = gates;
  }
}

/** Refuse with {@link GateUnsatisfiedError} when a gate is unsatisfied. */
export async function assertGatesSatisfied(
  documents: GateDocuments,
  subject: WorkflowSubject,
  phase: 'entry' | 'exit',
  step: string,
  gates: readonly DocumentGate[],
): Promise<void> {
  if (gates.length === 0) {
    return;
  }

  const unsatisfied = (await evaluateGates(documents, subject, gates)).filter(
    (gate) => gate.status === 'unsatisfied',
  );
  if (unsatisfied.length > 0) {
    throw new GateUnsatisfiedError(phase, step, unsatisfied);
  }
}
