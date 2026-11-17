import type { TFunction } from 'i18next';

/** At most this many Tasks are named on the overlay line; the rest is `(+N)`. */
const NAMED_TASKS = 2;

/**
 * The Engine's attention item of a Task, as any surface reads it: the stable reason code, its
 * display-only English message, the step it names and, for `on-hold-blocking`, what the held Task
 * holds up (`blocks`: dependents waiting on it directly and/or the step finish it refuses).
 */
export interface TaskAttentionFacts {
  readonly reason: string;
  readonly message?: string;
  readonly stepTitle?: string;
  readonly blocks?: { readonly taskIds?: readonly string[]; readonly finish?: string };
}

/** Why a Task row requires attention, as the Engine and Runtime report it. */
export interface TaskAttentionSource {
  /** The Task's own attention item. */
  readonly item?: TaskAttentionFacts;
  /** The Specification's `tasks-stuck` names the Task (no Task item then). */
  readonly blocksSpecification?: boolean;
  /** The Task's files are inconsistent (a broken row). */
  readonly broken?: boolean;
  /** The Specification's title, for "<specification> cannot continue until it moves". */
  readonly specificationTitle?: string;
  /** The escalation's feedback (the hold reason of an escalated Task), where the surface has it. */
  readonly feedback?: string;
}

/** The Requires attention overlay: a line added under the row's status, never replacing it. */
export interface TaskAttentionOverlay {
  readonly text: string;
  readonly icon: 'triangle-alert';
  readonly tone: 'attention';
}

function named(ids: readonly string[], t: TFunction): string {
  const shown = ids.slice(0, NAMED_TASKS).join(', ');
  const more = ids.length - NAMED_TASKS;

  return more > 0
    ? t('taskOverview.row.holdsUpMore', { ids: shown, more })
    : t('taskOverview.row.holdsUp', { ids: shown });
}

/**
 * The reason part of the line. A held Task that holds up the step finish names the finish first
 * (Close needs it, and the finish is the wider block); its dependents are named only when it holds up
 * no finish. Reasons without copy of their own keep the Engine's message.
 */
function reasonOf(item: TaskAttentionFacts, source: TaskAttentionSource, t: TFunction) {
  switch (item.reason) {
    case 'task-escalated':
      return source.feedback
        ? t('taskOverview.row.escalatedFeedback', { feedback: source.feedback })
        : t('taskOverview.row.escalated');
    case 'on-hold-blocking':
      if (item.blocks?.finish !== undefined) {
        return item.stepTitle
          ? t('taskOverview.row.holdsFinish', { step: item.stepTitle })
          : t('taskOverview.row.holdsFinishUnnamed');
      }

      return item.blocks?.taskIds && item.blocks.taskIds.length > 0
        ? named(item.blocks.taskIds, t)
        : item.message;
    default:
      return item.message;
  }
}

/**
 * Whether a Task row requires attention: the Engine reported it (an item about the Task, a
 * Specification item that names it, or broken files). The one predicate behind the overlay and
 * every surface that marks such a row; the UI never decides attention from a status.
 */
export function taskRequiresAttention(source: TaskAttentionSource): boolean {
  return source.item !== undefined || source.blocksSpecification === true || source.broken === true;
}

/**
 * The Requires attention overlay of a Task, worded from what the Engine reports (the item's reason
 * and `blocks`, the Specification's `tasks-stuck`). The UI never decides attention: without any of
 * them there is no overlay, whatever the status (an On hold Task alone is not attention). Broken
 * files add no overlay: the status already says it ("Cannot start · files broken", danger), so a
 * second line would only repeat it.
 */
export function taskAttentionOverlay(
  source: TaskAttentionSource,
  t: TFunction,
): TaskAttentionOverlay | undefined {
  const { item } = source;
  if (!taskRequiresAttention(source) || source.broken === true || item?.reason === 'task-broken') {
    return undefined;
  }

  const reason = item
    ? reasonOf(item, source, t)
    : source.specificationTitle
      ? t('taskOverview.row.blocksNamedSpecification', {
          specification: source.specificationTitle,
        })
      : t('taskOverview.row.blocksSpecification');

  return {
    text: reason
      ? t('taskOverview.row.attention', { reason })
      : t('taskOverview.row.attentionOnly'),
    icon: 'triangle-alert',
    tone: 'attention',
  };
}
