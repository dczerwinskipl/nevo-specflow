import type { DocumentContentState } from '@nevo/specflow-contracts/documents';
import type { DocumentRelation } from '@nevo/specflow-contracts/workflow';
import { message, type Message } from '../../../i18n/message';
import { gateLabel } from './gateLabel';

/*
 * One document state vocabulary for every surface (Overview Documents, the Documents page tree,
 * Task documents): two separate facts, the content state (what the file holds relative to the
 * initial content the Engine wrote) and the relation (how the workflow's gates use the document
 * now). Neither implies the other; the label names both only when both apply. Pure policy: the
 * texts are messages the row translates, and `TreeDocumentRow` renders them.
 */

/** The tone of the trailing label (`TreeRowState.tone`). */
export type DocumentStateTone = 'muted' | 'secondary' | 'attention';

export interface DocumentStateLabel {
  /** The label where the row has room. */
  readonly text: Message;
  /** The label in a narrow row: the relation without its step ("Needed to finish"). */
  readonly short: Message;
  /**
   * `attention` only when the gate refuses what the run waits for now, `secondary` for another
   * relation to the work at hand, `muted` for the standing content fact alone.
   */
  readonly tone: DocumentStateTone;
  /** Tooltip lines: the full label, the gate (its display text) and the sections it still lacks. */
  readonly details: readonly (Message | string)[];
  /** The label is the content state alone (no relation): the Overview may move it to its header. */
  readonly contentOnly: boolean;
}

export interface DocumentStateOptions {
  /**
   * The active step is on screen (Overview and Task detail, beside Now): a gate of that step reads
   * "this step". Elsewhere (the Documents page) the step title is named.
   */
  readonly stepOnScreen: boolean;
}

const relationTexts = {
  'needed-to-finish': {
    thisStep: 'documents.state.relation.neededToFinishThisStep',
    step: 'documents.state.relation.neededToFinishStep',
    short: 'documents.state.relation.neededToFinishShort',
    thisStepAfter: 'documents.state.afterContent.neededToFinishThisStep',
    stepAfter: 'documents.state.afterContent.neededToFinishStep',
    shortAfter: 'documents.state.afterContent.neededToFinishShort',
  },
  // The next step's gate: never "this step" (see `thisStep` below).
  'needed-to-start': {
    thisStep: 'documents.state.relation.neededToStartStep',
    step: 'documents.state.relation.neededToStartStep',
    short: 'documents.state.relation.neededToStartShort',
    thisStepAfter: 'documents.state.afterContent.neededToStartStep',
    stepAfter: 'documents.state.afterContent.neededToStartStep',
    shortAfter: 'documents.state.afterContent.neededToStartShort',
  },
  used: {
    thisStep: 'documents.state.relation.usedThisStep',
    step: 'documents.state.relation.usedStep',
    short: 'documents.state.relation.usedShort',
    thisStepAfter: 'documents.state.afterContent.usedThisStep',
    stepAfter: 'documents.state.afterContent.usedStep',
    shortAfter: 'documents.state.afterContent.usedShort',
  },
} as const;

const initialContent = message('documents.state.initialContent');
const initialContentShort = message('documents.state.initialContentShort');

function relationTone(relation: DocumentRelation): DocumentStateTone {
  return relation.blocksNow ? 'attention' : 'secondary';
}

function gateDetails(relation: DocumentRelation): (Message | string)[] {
  const missing = relation.gate.missingSections ?? [];

  return [
    gateLabel(relation.gate.label),
    ...(missing.length
      ? [message('documents.state.missingSections', { count: missing.length, sections: missing })]
      : []),
  ];
}

/**
 * The trailing label of one document row from its content state (`undefined`: the source cannot
 * tell) and its relation to the workflow (`undefined`: none). Undefined when neither applies: an
 * authored document the gates do not name carries no label.
 */
export function documentStateLabel(
  contentState: DocumentContentState | undefined,
  relation: DocumentRelation | undefined,
  { stepOnScreen }: DocumentStateOptions,
): DocumentStateLabel | undefined {
  const baseline = contentState === 'baseline';
  if (!relation) {
    return baseline
      ? {
          text: initialContent,
          short: initialContentShort,
          tone: 'muted',
          details: [],
          contentOnly: true,
        }
      : undefined;
  }

  const keys = relationTexts[relation.relation];
  // A needed-to-start gate belongs to the next step, so it always names it.
  const thisStep = stepOnScreen && relation.step.active && relation.relation !== 'needed-to-start';
  const step = { step: relation.step.title };
  const full = baseline
    ? message('documents.state.withContent', {
        content: initialContent,
        relation: thisStep ? message(keys.thisStepAfter) : message(keys.stepAfter, step),
      })
    : thisStep
      ? message(keys.thisStep)
      : message(keys.step, step);
  // "Used in this step" is short already; a lone "Used" would not say for what.
  const keepThisStep = thisStep && relation.relation === 'used';
  const short = baseline
    ? message('documents.state.withContent', {
        content: initialContentShort,
        relation: message(keepThisStep ? keys.thisStepAfter : keys.shortAfter),
      })
    : message(keepThisStep ? keys.thisStep : keys.short);

  return {
    text: full,
    short,
    tone: relationTone(relation),
    // The full label first: a narrow row shows only the short one.
    details: [full, ...gateDetails(relation)],
    contentOnly: false,
  };
}

/** A relation lookup for the documents of one registry (the Specification's or one Task's). */
export function documentRelations(
  relations: readonly DocumentRelation[] | undefined,
  scope: DocumentRelation['scope'],
): ReadonlyMap<string, DocumentRelation> {
  const sameScope = (candidate: DocumentRelation['scope']) =>
    candidate.kind === scope.kind &&
    candidate.specId === scope.specId &&
    (candidate.kind === 'specification' ||
      (scope.kind === 'task' && candidate.taskId === scope.taskId));

  return new Map(
    (relations ?? [])
      .filter((relation) => sameScope(relation.scope))
      .map((relation) => [relation.documentId, relation]),
  );
}

/**
 * The label every listed row would carry when it is the same content-only label for all of them
 * (for example four untouched documents): a list header says it once and the rows carry none.
 * Undefined for fewer than two rows, or when any row differs or names a relation.
 */
export function sharedContentLabel(
  labels: readonly (DocumentStateLabel | undefined)[],
): DocumentStateLabel | undefined {
  const [first] = labels;
  if (labels.length < 2 || !first?.contentOnly) {
    return undefined;
  }

  return labels.every((label) => label?.contentOnly && label.text.key === first.text.key)
    ? first
    : undefined;
}
