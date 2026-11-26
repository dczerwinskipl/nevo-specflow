import type { SessionSnapshot, WorkDigest } from '@nevo/specflow-contracts/sessions';

type CurrentActivity = NonNullable<SessionSnapshot['currentActivity']>;
type ActiveTurn = NonNullable<SessionSnapshot['activeTurn']>;

/** What the active Turn is doing right now, from the authoritative projection only. */
export interface LiveActivity {
  kind: CurrentActivity['kind'];
  /** Runtime's own label (a tool title for `tool`); absent when only the Turn state is known. */
  label?: string;
}

/**
 * Live line source, never inferred from the last Work entry: `currentActivity` when the runtime
 * reports one, otherwise the active Turn's own state (the runtime clears `currentActivity` between
 * Work items while the Turn is still running). `attention`/`waitingForUser` produce nothing — the
 * pending interaction prompt already owns that fact.
 */
export function liveActivity(
  activeTurn: ActiveTurn | undefined,
  currentActivity: CurrentActivity | undefined,
): LiveActivity | undefined {
  // An unknown outcome is not running: its single owner is the reconcile notice above the Composer
  // (full-session.md "Unknown Turn outcome"), so the Work block shows no live line and no spinner.
  if (!activeTurn || activeTurn.state === 'unknown') {
    return undefined;
  }

  if (currentActivity?.turnId === activeTurn.turnId) {
    return currentActivity.kind === 'attention'
      ? undefined
      : { kind: currentActivity.kind, label: currentActivity.label };
  }

  switch (activeTurn.state) {
    case 'active':
      return { kind: 'unknown' };
    case 'waiting':
      return { kind: 'waiting' };
    case 'cancelling':
      return { kind: 'cancelling' };
    default:
      return undefined;
  }
}

/**
 * One stage of a Turn's tool Work in the Conversation (full-session.md "Conversation"): the tool
 * Work the agent did after a Commentary, plus, on the active Turn's last stage, what is happening
 * right now. Built by `transcriptItems` from the Turn's `work-summary` entries, so raw tool titles
 * never become chat rows. How the Turn ended is its own event (`TurnOutcomeItem`), never part of a
 * stage.
 */
export interface WorkBlockModel {
  turnId: string;
  /** Stable key/anchor: the stage's last `work-summary` entry, or the Turn while nothing is there. */
  id: string;
  /** Tool Work the client has loaded for this stage (one real entry per tool Work). */
  actionCount: number;
  /** The stage's tool Work, by Work id: Work history opens at them (`focusWork`). */
  workIds: readonly string[];
  /** The stage may continue into older, not-yet-loaded history: `actionCount` is a lower bound. */
  partial: boolean;
  /** This stage's share of the Runtime's by-operation ToolAction digest; absent when unknown. */
  digest?: WorkDigest;
  /** Present only on the active Turn's last stage while something is happening in it. */
  live?: LiveActivity;
}
