import type { WorkflowHistory } from '@nevo/specflow-contracts/workflow';

type HistoryItem = WorkflowHistory['items'][number];
export type AttemptItem = Extract<HistoryItem, { kind: 'attempt' }>;
export type ReturnItem = Extract<HistoryItem, { kind: 'return' }>;

/**
 * Which feedback the shared Feedback view shows (workflow-execution.md, "Feedback"): an attempt's
 * (its result's, or the owner's Reject of it), or a return's. A Last hand-off that is a return
 * names no attempt, only when it happened (`returnedAt`): a return record, the Reject of a result,
 * or an attempt that returned, matched by that time in the history.
 */
export type FeedbackRef =
  { readonly step: string; readonly attempt: number } | { readonly returnedAt: string };

/** What the Feedback view shows: an attempt, or a return the owner made between attempts. */
export type FeedbackSubject =
  | { readonly kind: 'attempt'; readonly item: AttemptItem }
  | { readonly kind: 'return'; readonly item: ReturnItem };

const text = (value: string | undefined) => (value?.trim() ? value : undefined);

/** The feedback an attempt's result or its return left, if any. */
export function resultFeedbackOf(item: AttemptItem): string | undefined {
  const outcome = item.outcome;

  return outcome?.kind === 'transition' || outcome?.kind === 'returned'
    ? text(outcome.feedback)
    : undefined;
}

/** The feedback of the owner's Reject of the attempt's result, if any. */
export function rejectionFeedbackOf(item: AttemptItem): string | undefined {
  return item.confirmation?.state === 'rejected' ? text(item.confirmation.feedback) : undefined;
}

/** Whether the attempt has any feedback to view. */
export function hasFeedback(item: AttemptItem): boolean {
  return resultFeedbackOf(item) !== undefined || rejectionFeedbackOf(item) !== undefined;
}

/** The subject a reference names in the history; undefined when the history does not hold it. */
export function findFeedbackSubject(
  items: readonly HistoryItem[],
  ref: FeedbackRef,
): FeedbackSubject | undefined {
  const attempts = items.filter((item): item is AttemptItem => item.kind === 'attempt');
  if ('step' in ref) {
    const item = attempts.find(
      (candidate) => candidate.step === ref.step && candidate.attempt === ref.attempt,
    );

    return item ? { kind: 'attempt', item } : undefined;
  }

  // The three records a return hand-off is made from (`handoffOf` in @nevo/workflow).
  const returned = items.find(
    (item): item is ReturnItem => item.kind === 'return' && item.at === ref.returnedAt,
  );
  if (returned) {
    return { kind: 'return', item: returned };
  }

  const item =
    attempts.find(
      (candidate) =>
        candidate.confirmation?.state === 'rejected' &&
        candidate.confirmation.at === ref.returnedAt,
    ) ??
    attempts.find(
      (candidate) =>
        candidate.outcome?.kind === 'returned' &&
        (candidate.endedAt ?? candidate.startedAt) === ref.returnedAt,
    );

  return item ? { kind: 'attempt', item } : undefined;
}

/** The subject's feedback as its original Markdown, in the order it was written. */
export function feedbackSections(subject: FeedbackSubject): readonly {
  readonly source: 'result' | 'rejection';
  readonly markdown: string;
}[] {
  if (subject.kind === 'return') {
    const markdown = text(subject.item.feedback);

    return markdown ? [{ source: 'result', markdown }] : [];
  }

  const result = resultFeedbackOf(subject.item);
  const rejection = rejectionFeedbackOf(subject.item);

  return [
    ...(result ? [{ source: 'result' as const, markdown: result }] : []),
    ...(rejection ? [{ source: 'rejection' as const, markdown: rejection }] : []),
  ];
}
