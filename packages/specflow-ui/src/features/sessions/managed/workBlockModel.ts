import type {
  ConversationEntry,
  SessionSnapshot,
  WorkDigest,
} from '@nevo/specflow-contracts/sessions';

type Entry = ConversationEntry;
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
 * One Turn's Work in the Conversation (full-session.md "Work block"): every `work-summary`
 * entry of the Turn folded into a single block, plus — while the Turn is live — what is happening
 * right now, and — once it has ended — its terminal outcome.
 *
 * The real runtime emits one `work-summary` entry per tool Work it opens (title only, see
 * `specflow-runtime/.../persistence/facts.ts`), so rendering entries 1:1 would put raw tool titles
 * into the chat. The block is the only place a Turn's Work appears in Primary.
 */
export interface WorkBlockModel {
  turnId: string;
  /** Stable key/anchor: the Turn's last folded entry, or the Turn itself while nothing is folded. */
  id: string;
  /** Tool Work the client has loaded for this Turn (one real entry per tool Work). */
  actionCount: number;
  /** The Turn may continue into older, not-yet-loaded history: `actionCount` is a lower bound. */
  partial: boolean;
  /** Runtime's by-operation ToolAction digest from the Turn's latest `work-summary` entry; absent
   * for Turns recorded before Runtime maintained it. */
  digest?: WorkDigest;
  /** Present only while this is the Session's active Turn and something is happening in it. */
  live?: LiveActivity;
  /** Terminal outcome folded in from the Turn's `outcome` entry (block owns it; no second row). */
  outcome?: string;
}

export type ConversationItem =
  { type: 'entry'; entry: Entry } | { type: 'work'; block: WorkBlockModel };

/**
 * Orders the Conversation as entries plus at most one Work block per Turn.
 *
 * Placement: a settled Turn's block takes the position of its last `work-summary` entry (Commentary
 * before it stays before it). The active Turn's block sits at the end of that Turn — before its
 * streaming answer if one already exists — so "what is happening now" is always the Turn's latest
 * line.
 *
 * Single owner for terminal state: when a Turn has a block, the block shows its failed/cancelled/
 * interrupted outcome and the separate `outcome` entry is dropped; a Turn with no Work keeps its
 * outcome row (the only place that fact exists then).
 *
 * The live line comes from `liveActivity` (authoritative projection), never from the last entry.
 */
export function conversationItems(
  entries: readonly Entry[],
  options: {
    activeTurn?: ActiveTurn;
    currentActivity?: CurrentActivity;
    hasOlder: boolean;
  },
): ConversationItem[] {
  const { activeTurn, currentActivity, hasOlder } = options;
  const activeTurnId = activeTurn?.turnId;
  const live = liveActivity(activeTurn, currentActivity);

  const byTurn = new Map<
    string,
    { work: Entry[]; outcome?: Entry; firstIndex: number; lastIndex: number; answerIndex?: number }
  >();
  entries.forEach((entry, index) => {
    const turn = byTurn.get(entry.turnId) ?? { work: [], firstIndex: index, lastIndex: index };
    turn.lastIndex = index;
    if (entry.kind === 'work-summary') {
      turn.work.push(entry);
    } else if (entry.kind === 'outcome') {
      turn.outcome = entry;
    } else if (entry.kind === 'answer' && turn.answerIndex === undefined) {
      turn.answerIndex = index;
    }

    byTurn.set(entry.turnId, turn);
  });

  // `before[i]`: block rendered immediately before entry i (or at the end when i === length).
  const before = new Map<number, WorkBlockModel[]>();
  let liveBlockPlaced = false;
  for (const [turnId, turn] of byTurn) {
    const isLive = live !== undefined && turnId === activeTurnId;
    if (turn.work.length === 0 && !isLive) {
      continue;
    }

    const lastWork = turn.work.at(-1);
    const digest = [...turn.work].reverse().find((entry) => entry.digest)?.digest;
    const block: WorkBlockModel = {
      turnId,
      id: lastWork?.id ?? `work-${turnId}`,
      actionCount: turn.work.length,
      partial: hasOlder && turn.firstIndex === 0,
      ...(digest ? { digest } : {}),
      ...(isLive ? { live } : {}),
      ...(!isLive && turn.outcome ? { outcome: turn.outcome.text.text } : {}),
    };
    const position = isLive ? (turn.answerIndex ?? turn.lastIndex + 1) : entries.indexOf(lastWork!);
    before.set(position, [...(before.get(position) ?? []), block]);
    liveBlockPlaced ||= isLive;
  }

  const items: ConversationItem[] = [];
  const emitBefore = (position: number) => {
    for (const block of before.get(position) ?? []) {
      items.push({ type: 'work', block });
    }
  };

  entries.forEach((entry, index) => {
    emitBefore(index);
    const turn = byTurn.get(entry.turnId)!;
    const foldedOutcome =
      entry.kind === 'outcome' &&
      turn.work.length > 0 &&
      !(live !== undefined && entry.turnId === activeTurnId);
    if (entry.kind !== 'work-summary' && !foldedOutcome) {
      items.push({ type: 'entry', entry });
    }
  });
  emitBefore(entries.length);

  // An active Turn whose own entries are not in the loaded window yet still shows what it does now.
  if (live && activeTurnId && !liveBlockPlaced) {
    items.push({
      type: 'work',
      block: {
        turnId: activeTurnId,
        id: `work-${activeTurnId}`,
        actionCount: 0,
        partial: hasOlder,
        live,
      },
    });
  }

  return items;
}
