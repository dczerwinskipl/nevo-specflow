import type { TFunction } from 'i18next';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import type { AttemptCommitView } from '../agent/AttemptCommitNote';
import {
  actorLabel,
  formatWhen,
  transitionLabel,
  type ModelTitle,
  type Viewer,
} from '../presentation';
import type { HandoffTone } from './LastHandoff';

type Handoff = NonNullable<WorkflowActionProjection['handoff']>;

/** What the Now's Last hand-off row says about a hand-off. */
export interface HandoffView {
  readonly outcome: string;
  readonly meta?: string;
  readonly feedback?: string;
  readonly tone: HandoffTone;
}

/**
 * A hand-off as the Last hand-off row reads it: the result taken ("Breakdown approved"), the step,
 * who took it and when ("Review the breakdown · Claude · Opus 5.5 · Today, 1:12 AM"). A review that requested changes (`fail`) and a
 * return are what the next attempt must act on (`blocking`); any other result is `done`.
 */
export function handoffView(
  t: TFunction,
  handoff: Handoff,
  context: { readonly locale: string; readonly viewer?: Viewer; readonly modelTitle?: ModelTitle },
): HandoffView {
  const when = (at: string) => formatWhen(t, at, context.locale);
  const feedback = handoff.feedback?.trim() ? { feedback: handoff.feedback } : {};
  if (handoff.kind === 'return') {
    return {
      outcome: t('workflowExecution.now.returned'),
      meta: when(handoff.at),
      tone: 'blocking',
      ...feedback,
    };
  }

  // The step that handed over leads: "Changes requested" is read with the review that said it.
  const meta = [
    handoff.from.title || undefined,
    handoff.from.actor
      ? actorLabel(t, handoff.from.actor, context.viewer, context.modelTitle)
      : undefined,
    handoff.from.at ? when(handoff.from.at) : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    outcome: transitionLabel({ ...handoff, id: handoff.transition }),
    ...(meta ? { meta } : {}),
    tone: handoff.result === 'fail' ? 'blocking' : 'done',
    ...feedback,
  };
}

/** A committed attempt as one line: "4 documents committed · 05f9d80". Undefined otherwise. */
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
      ? t('workflowExecution.now.handoffCommitted', {
          what: counts.join(t('workflowExecution.attemptCommit.and')),
        })
      : t('workflowExecution.now.handoffCommittedAll');

  return [what, commit.sha?.slice(0, 7)].filter(Boolean).join(' · ');
}
