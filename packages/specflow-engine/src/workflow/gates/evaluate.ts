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
  /** The file exists but could not be read: it never satisfies a gate (fail closed). */
  readonly unreadable?: true;
}

export const GATE_UNSATISFIED_REASONS = [
  /** The scope registers no document of the type. */
  'no-document',
  /** Documents of the type are registered, but none has a file. */
  'file-missing',
  /** No document of the type has a heading for each required section. */
  'sections-missing',
  /** The only documents of the type with a file could not be read. */
  'unreadable',
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
  /**
   * Satisfied: the document that satisfies it; `sections-missing`: the closest document;
   * `unreadable`: the first document that could not be read.
   */
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

/** A code fence line: its marker and what follows it (the info string of an opening fence). */
const FENCE = /^\s{0,3}(`{3,}|~{3,})(.*)$/u;
const ATX_HEADING = /^\s{0,3}#{1,6}(?:\s+(.*?))?\s*$/u;
const FRONT_MATTER_OPEN = /^---\s*$/u;
const FRONT_MATTER_CLOSE = /^(?:---|\.\.\.)\s*$/u;

/** How a section is compared: its exact text after trimming, case-insensitive. */
const normalized = (text: string) => text.trim().toLowerCase();

/** The line after a front matter block at the very start (`---` ... `---`/`...`); 0 without one. */
function bodyStart(lines: readonly string[]): number {
  if (!FRONT_MATTER_OPEN.test(lines[0] ?? '')) {
    return 0;
  }

  const close = lines.findIndex((line, index) => index > 0 && FRONT_MATTER_CLOSE.test(line));

  return close < 0 ? 0 : close + 1;
}

/**
 * The texts of the ATX headings (`#` to `######`, any level) of a Markdown text, compared as
 * {@link normalized} text without the closing `#` sequence; inline markup is not stripped. Setext
 * headings (underlined) do not count. Ignored: a front matter block at the start, fenced code
 * (CommonMark: a fence closes only with the same character, at least as long, and nothing after it)
 * and the lines of an HTML comment (`<!--` to `-->`).
 */
export function markdownHeadings(text: string): ReadonlySet<string> {
  const headings = new Set<string>();
  const lines = text.split(/\r?\n/u);
  let fence: string | undefined;
  let comment = false;
  for (const line of lines.slice(bodyStart(lines))) {
    if (comment) {
      comment = !line.includes('-->');
      continue;
    }

    const opened = FENCE.exec(line);
    if (fence !== undefined) {
      const closes =
        opened?.[1] !== undefined &&
        opened[1].startsWith(fence.charAt(0)) &&
        opened[1].length >= fence.length &&
        (opened[2] ?? '').trim() === '';
      if (closes) {
        fence = undefined;
      }

      continue;
    }

    if (opened?.[1] !== undefined) {
      fence = opened[1];
      continue;
    }

    const start = line.indexOf('<!--');
    if (start >= 0 && !line.includes('-->', start + 4)) {
      comment = true;
      continue;
    }

    const content = ATX_HEADING.exec(line);
    if (content) {
      headings.add(normalized((content[1] ?? '').replace(/(?:^|\s+)#+$/u, '')));
    }
  }

  return headings;
}

/**
 * A `document` gate over the documents of its type the scope registers (registry order): satisfied
 * by the first readable document with a file that has every required section as a heading.
 * Otherwise the reason is the furthest any document got (`sections-missing` naming the document that
 * lacks the fewest sections, the first of equals; then `unreadable`; then `file-missing`).
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
  let unreadable: string | undefined;
  for (const document of documents) {
    if (!document.present) {
      continue;
    }

    if (document.unreadable) {
      unreadable ??= document.id;
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

  if (unreadable !== undefined) {
    return { ...base, status: 'unsatisfied', reason: 'unreadable', documentId: unreadable };
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
