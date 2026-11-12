import type { DocumentGate, ExitGate, WorkStep } from '../definitions/model';
import type { WorkflowSubject } from '../state/model';

/**
 * Gates of a workflow step (`definitions/model.ts`: `DocumentGate`), evaluated by the Engine. The
 * evaluation is pure over what a read found ({@link GateDocument}); `./read.ts` does the read. An
 * inspection and the authoritative check before a start or finish use the same functions, so a gate
 * the projection shows satisfied is refused only when the documents changed in between.
 */

/** Where a gate looked: the Specification, or one Task of it (link data for surfaces). */
export type GateScopeRef =
  | { readonly kind: 'specification'; readonly specId: string }
  | { readonly kind: 'task'; readonly specId: string; readonly taskId: string };

/** One registered document of the looked-up type, as a read found it. */
export interface GateDocument {
  readonly id: string;
  /** Whether the registered document has a file. */
  readonly present: boolean;
  /** The file's text, when it is a text file that could be read whole. */
  readonly text?: string;
}

export const GATE_UNSATISFIED_REASONS = [
  /** The scope registers no document of the type. */
  'no-document',
  /** Documents of the type are registered, but none has a file. */
  'file-missing',
  /** No document of the type has a heading for each required section. */
  'sections-missing',
] as const;
export type GateUnsatisfiedReason = (typeof GATE_UNSATISFIED_REASONS)[number];

/** A gate as an inspection or a refusal reports it. */
export interface GateStatus {
  readonly id: string;
  readonly type: 'document';
  /** Display text: the gate's `label`, else a description derived from it. */
  readonly label: string;
  readonly documentType: string;
  readonly scope: GateScopeRef;
  readonly status: 'satisfied' | 'unsatisfied';
  /** Satisfied: the document that satisfies it; `sections-missing`: the closest document. */
  readonly documentId?: string;
  readonly reason?: GateUnsatisfiedReason;
  /** `sections-missing`: the required sections the closest document lacks, in declared order. */
  readonly missingSections?: readonly string[];
}

/** Where a gate of a step of the subject's run looks. */
export function gateScope(subject: WorkflowSubject, gate: DocumentGate): GateScopeRef {
  return subject.kind === 'task' && gate.scope === 'subject'
    ? { kind: 'task', specId: subject.specId, taskId: subject.taskId }
    : { kind: 'specification', specId: subject.specId };
}

function labelOf(gate: DocumentGate): string {
  if (gate.label !== undefined) {
    return gate.label;
  }

  const sections =
    gate.requiredSections.length > 0 ? ` with ${gate.requiredSections.join(', ')}` : '';

  return `A "${gate.documentType}" document${sections}`;
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})/u;
const ATX_HEADING = /^\s{0,3}#{1,6}(?:\s+(.*?))?\s*$/u;

const normalized = (text: string) => text.trim().replace(/\s+/gu, ' ').toLowerCase();

/**
 * The texts of the ATX headings (`#` to `######`) of a Markdown text, normalized (trimmed, inner
 * whitespace collapsed, lowercase), without a closing `#` sequence and outside fenced code blocks.
 */
export function markdownHeadings(text: string): ReadonlySet<string> {
  const headings = new Set<string>();
  let fence: string | undefined;
  for (const line of text.split(/\r?\n/u)) {
    const marker = FENCE.exec(line)?.[1];
    if (marker !== undefined) {
      if (fence === undefined) {
        fence = marker;
      } else if (marker.startsWith(fence[0] ?? '') && marker.length >= fence.length) {
        fence = undefined;
      }

      continue;
    }

    const content = fence === undefined ? ATX_HEADING.exec(line) : null;
    if (content) {
      headings.add(normalized((content[1] ?? '').replace(/(?:^|\s+)#+$/u, '')));
    }
  }

  return headings;
}

/**
 * A `document` gate over the documents of its type the scope registers (registry order): satisfied
 * by the first document with a file that has every required section as a heading. Otherwise the
 * reason is the furthest any document got, and `sections-missing` names the document that lacks the
 * fewest sections (the first of equals).
 */
export function evaluateDocumentGate(
  gate: DocumentGate,
  scope: GateScopeRef,
  documents: readonly GateDocument[],
): GateStatus {
  const base = {
    id: gate.id,
    type: gate.type,
    label: labelOf(gate),
    documentType: gate.documentType,
    scope,
  };
  let closest: { readonly id: string; readonly missing: readonly string[] } | undefined;
  for (const document of documents) {
    if (!document.present) {
      continue;
    }

    const headings =
      document.text === undefined ? new Set<string>() : markdownHeadings(document.text);
    const missing = gate.requiredSections.filter((section) => !headings.has(normalized(section)));
    if (missing.length === 0) {
      return { ...base, status: 'satisfied', documentId: document.id };
    }

    if (closest === undefined || missing.length < closest.missing.length) {
      closest = { id: document.id, missing };
    }
  }

  if (closest) {
    return {
      ...base,
      status: 'unsatisfied',
      reason: 'sections-missing',
      documentId: closest.id,
      missingSections: closest.missing,
    };
  }

  return {
    ...base,
    status: 'unsatisfied',
    reason: documents.length === 0 ? 'no-document' : 'file-missing',
  };
}

/** The exit gates of a step that apply to finishing it with a transition of this result. */
export function exitGatesFor(step: WorkStep, result: string | undefined): readonly ExitGate[] {
  return (step.annotations.exitGates ?? []).filter(
    (gate) => gate.when === undefined || (result !== undefined && gate.when.includes(result)),
  );
}

export function entryGatesOf(step: WorkStep): readonly DocumentGate[] {
  return step.annotations.entryGates ?? [];
}
