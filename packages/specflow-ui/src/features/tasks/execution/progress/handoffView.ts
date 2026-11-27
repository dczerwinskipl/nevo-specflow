import type { TFunction } from 'i18next';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import type { AttemptCommitView } from '../agent/AttemptCommitNote';
import {
  actorLabel,
  formatWhen,
  transitionLabel,
  type AgentTitles,
  type Viewer,
} from '../presentation';
import type { HandoffTone } from './LastHandoff';

type Handoff = NonNullable<WorkflowActionProjection['handoff']>;

/** What the Now's Last hand-off row says about a hand-off. */
export interface HandoffView {
  readonly outcome: string;
  /** The step, who took it and when, one line each. */
  readonly lines: readonly string[];
  /** Whether the hand-off left feedback (View feedback opens it). */
  readonly hasFeedback: boolean;
  readonly tone: HandoffTone;
}

/**
 * A hand-off as the Last hand-off row reads it: the result taken ("Breakdown approved"), then the
 * step, who took it and when, one line each ("Review the breakdown", "Claude Code · Opus 5.5",
 * "Today, 1:12 AM"). A review that requested changes (`fail`) and a return are what the next attempt
 * must act on (`blocking`); any other result is `done`.
 */
export function handoffView(
  t: TFunction,
  handoff: Handoff,
  context: { readonly locale: string; readonly viewer?: Viewer; readonly titles?: AgentTitles },
): HandoffView {
  const when = (at: string) => formatWhen(t, at, context.locale);
  const hasFeedback = Boolean(handoff.feedback?.trim());
  if (handoff.kind === 'return') {
    return {
      outcome: t('workflowExecution.now.returned'),
      lines: [when(handoff.at)],
      tone: 'blocking',
      hasFeedback,
    };
  }

  // The step that handed over leads: "Changes requested" is read with the review that said it.
  const lines = [
    handoff.from.title || undefined,
    handoff.from.actor
      ? actorLabel(t, handoff.from.actor, context.viewer, context.titles)
      : undefined,
    handoff.from.at ? when(handoff.from.at) : undefined,
  ].filter((line): line is string => Boolean(line));

  return {
    outcome: transitionLabel({ ...handoff, id: handoff.transition }),
    lines,
    tone: handoff.result === 'fail' ? 'blocking' : 'done',
    hasFeedback,
  };
}

/** A committed attempt as one line: "4 documents · 05f9d80" (beside the commit icon). Undefined otherwise. */
export function commitLine(
  t: TFunction,
  commit: AttemptCommitView | undefined,
): string | undefined {
  if (commit?.state !== 'committed') {
    return undefined;
  }

  const counts = [
    commit.documents
      ? t('workflowExecution.attemptCommit.countDocuments', { count: commit.documents })
      : undefined,
    commit.files
      ? t('workflowExecution.attemptCommit.countFiles', { count: commit.files })
      : undefined,
  ].filter(Boolean);
  const what =
    counts.length > 0
      ? counts.join(t('workflowExecution.attemptCommit.and'))
      : t('workflowExecution.now.handoffCommittedAll');

  return [what, commit.sha?.slice(0, 7)].filter(Boolean).join(' · ');
}
