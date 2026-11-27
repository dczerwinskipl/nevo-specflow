import type {
  ConversationEntry,
  RequestOrigin,
  SessionSnapshot,
  ToolOperation,
  WorkDigest,
} from '@nevo/specflow-contracts/sessions';
import { liveActivity, type WorkBlockModel } from '../workBlockModel';

type Entry = ConversationEntry;
type TurnError = NonNullable<Entry['error']>;
type CurrentActivity = NonNullable<SessionSnapshot['currentActivity']>;
type ActiveTurn = NonNullable<SessionSnapshot['activeTurn']>;
type Outcome = 'completed' | 'failed' | 'cancelled' | 'interrupted';

/**
 * One stage of an agent's work (full-session.md "Conversation"): the Commentary the agent wrote
 * and the tool Work it did right after, until its next Commentary. Built only from entry kinds
 * (`commentary`, `work-summary`), never from what the text says.
 */
export interface TranscriptStage {
  type: 'stage';
  /** Stable key: the stage's first entry. */
  id: string;
  turnId: string;
  commentary: Entry[];
  /** The stage's tool Work, when it did any (or the live line of the active Turn). */
  block?: WorkBlockModel;
}

/** How a Turn that did not simply complete ended: one event, with its cause and consequence. */
export interface TurnOutcomeItem {
  type: 'outcome';
  /** The `outcome` entry. */
  id: string;
  turnId: string;
  outcome: Exclude<Outcome, 'completed'>;
  error?: TurnError;
  /** What SpecFlow said about it in the Turn (its error and warning notices), oldest first. */
  notices: string[];
  /** The Turn opened tool actions that may have changed the workspace. */
  workspaceMayHaveChanged: boolean;
}

export type TranscriptItem =
  /** A person's request, an answer, or a SpecFlow note that does not explain a Turn's end. */
  | { type: 'entry'; entry: Entry }
  /** SpecFlow's brief of an agent step: its start, or (`continuation`) the attempt resumed. */
  | { type: 'brief'; entry: Entry; origin: RequestOrigin }
  /** Who answers from here on, before the first agent output of a Turn. */
  | { type: 'agent'; id: string; turnId: string }
  | TranscriptStage
  | TurnOutcomeItem;

/** Operations that may change the workspace (`ToolOperation`, the Runtime's own classification). */
const changingOperations: readonly ToolOperation[] = ['edit', 'write', 'command', 'test'];

const isOutcome = (text: string): text is Outcome =>
  text === 'completed' || text === 'failed' || text === 'cancelled' || text === 'interrupted';

/** `later - earlier` per operation; operations that did not grow are left out. */
function subtract(
  later: WorkDigest['opened'] | undefined,
  earlier: WorkDigest['opened'] | undefined,
): WorkDigest['opened'] {
  const result: WorkDigest['opened'] = {};
  for (const [operation, count] of Object.entries(later ?? {}) as [ToolOperation, number][]) {
    const delta = count - (earlier?.[operation] ?? 0);
    if (delta > 0) {
      result[operation] = delta;
    }
  }

  return result;
}

const latestDigest = (entries: readonly Entry[]) =>
  [...entries].reverse().find((entry) => entry.digest)?.digest;

/**
 * The conversation as a transcript (full-session.md "Conversation"): a brief or request, who
 * answers, the agent's work in stages, its answer, then how the Turn ended when it did not simply
 * complete.
 *
 * - **Stages.** Consecutive `commentary` entries followed by consecutive `work-summary` entries of
 *   one Turn form a stage: its Commentary, then one tool row for that Work. The row's counts are the
 *   stage's share of the Turn's Runtime digest: each `work-summary` entry keeps the digest it had
 *   while it was the latest, so a stage's counts are its last entry's digest minus the previous
 *   stage's. The first loaded stage of a Turn that may continue into older history has no earlier
 *   digest to subtract: it shows the honest count of its loaded tool Work, as a lower bound.
 * - **Live.** The active Turn's live line sits on its last stage while nothing follows it, else on
 *   a stage of its own before the streaming answer (`liveActivity`, never from the last entry).
 * - **Outcome.** A Turn that failed, was stopped or was interrupted ends with one outcome event at
 *   its `outcome` entry. SpecFlow's error and warning notices of that Turn are its cause and are not
 *   repeated as rows; a completed Turn adds nothing.
 * - **Agent.** The first agent output of each Turn (Commentary, Work or answer) is preceded by one
 *   `agent` item naming who answers.
 */
export function transcriptItems(
  entries: readonly Entry[],
  options: {
    activeTurn?: ActiveTurn;
    currentActivity?: CurrentActivity;
    hasOlder: boolean;
  },
): TranscriptItem[] {
  const { activeTurn, currentActivity, hasOlder } = options;
  const live = liveActivity(activeTurn, currentActivity);
  const liveTurnId = live ? activeTurn?.turnId : undefined;
  const firstTurnId = entries[0]?.turnId;

  // How each Turn ended (only settled outcomes other than completion get an event).
  const endedBadly = new Set<string>();
  const turnDigest = new Map<string, WorkDigest>();
  for (const entry of entries) {
    if (
      entry.kind === 'outcome' &&
      entry.text.text !== 'completed' &&
      isOutcome(entry.text.text) &&
      entry.turnId !== liveTurnId
    ) {
      endedBadly.add(entry.turnId);
    }

    if (entry.kind === 'work-summary' && entry.digest) {
      turnDigest.set(entry.turnId, entry.digest);
    }
  }

  const items: TranscriptItem[] = [];
  const notices = new Map<string, string[]>();
  const introduced = new Set<string>();
  // Per Turn: the digest at the end of its previous stage (`null`: the Turn starts on an older page).
  const previousDigest = new Map<string, WorkDigest | null | undefined>();
  let stage: (TranscriptStage & { work: Entry[] }) | undefined;

  const introduce = (entry: Entry) => {
    if (!introduced.has(entry.turnId)) {
      introduced.add(entry.turnId);
      items.push({ type: 'agent', id: `agent-${entry.turnId}`, turnId: entry.turnId });
    }
  };

  const closeStage = () => {
    if (!stage) {
      return;
    }

    const { work, ...rest } = stage;
    if (work.length > 0) {
      const digest = latestDigest(work);
      const previous = previousDigest.get(stage.turnId);
      rest.block = {
        turnId: stage.turnId,
        id: work.at(-1)!.id,
        actionCount: work.length,
        workIds: work.flatMap((entry) => (entry.workId ? [entry.workId] : [])),
        partial: previous === null,
        ...(digest && previous !== null
          ? {
              digest: {
                opened: subtract(digest.opened, previous?.opened),
                ...(digest.failed ? { failed: subtract(digest.failed, previous?.failed) } : {}),
              },
            }
          : {}),
      };
      // Without a digest here, later stages have nothing exact to subtract: lower bounds too.
      previousDigest.set(stage.turnId, digest && previous !== null ? digest : null);
    }

    items.push(rest);
    stage = undefined;
  };

  const openStage = (entry: Entry) => {
    if (!previousDigest.has(entry.turnId)) {
      // The oldest loaded Turn may have stages on an older page: nothing to subtract from yet.
      previousDigest.set(entry.turnId, hasOlder && entry.turnId === firstTurnId ? null : undefined);
    }

    stage = { type: 'stage', id: entry.id, turnId: entry.turnId, commentary: [], work: [] };

    return stage;
  };

  for (const entry of entries) {
    if (stage && stage.turnId !== entry.turnId) {
      closeStage();
    }

    switch (entry.kind) {
      case 'request': {
        closeStage();
        items.push(
          entry.origin?.kind === 'specflow-step-brief'
            ? { type: 'brief', entry, origin: entry.origin }
            : { type: 'entry', entry },
        );
        break;
      }

      case 'commentary': {
        if (entry.notice) {
          // SpecFlow's own words. An error or warning of a Turn that ended badly is its cause: said
          // once, in the outcome event.
          if (endedBadly.has(entry.turnId) && entry.notice.severity !== 'info') {
            notices.set(entry.turnId, [...(notices.get(entry.turnId) ?? []), entry.text.text]);
          } else {
            closeStage();
            items.push({ type: 'entry', entry });
          }

          break;
        }

        introduce(entry);
        if (!stage || stage.work.length > 0) {
          closeStage();
          openStage(entry);
        }

        stage!.commentary.push(entry);
        break;
      }

      case 'work-summary': {
        introduce(entry);
        (stage ?? openStage(entry)).work.push(entry);
        break;
      }

      case 'answer': {
        closeStage();
        introduce(entry);
        items.push({ type: 'entry', entry });
        break;
      }

      case 'outcome': {
        closeStage();
        if (endedBadly.has(entry.turnId) && isOutcome(entry.text.text)) {
          const digest = turnDigest.get(entry.turnId);
          items.push({
            type: 'outcome',
            id: entry.id,
            turnId: entry.turnId,
            outcome: entry.text.text as TurnOutcomeItem['outcome'],
            ...(entry.error ? { error: entry.error } : {}),
            notices: [],
            workspaceMayHaveChanged: changingOperations.some(
              (operation) => (digest?.opened[operation] ?? 0) > 0,
            ),
          });
        }

        break;
      }
    }
  }

  closeStage();

  // Notices are collected while walking; the outcome follows them in the same Turn.
  for (const item of items) {
    if (item.type === 'outcome') {
      item.notices = notices.get(item.turnId) ?? [];
    }
  }

  if (live && liveTurnId) {
    placeLive(items, liveTurnId, live, hasOlder);
  }

  return items;
}

/** Puts the active Turn's live line on its last stage, or on a stage of its own. */
function placeLive(
  items: TranscriptItem[],
  turnId: string,
  live: NonNullable<ReturnType<typeof liveActivity>>,
  hasOlder: boolean,
) {
  let lastIndex = -1;
  items.forEach((item, index) => {
    if ('turnId' in item ? item.turnId === turnId : item.entry.turnId === turnId) {
      lastIndex = index;
    }
  });

  const last = items[lastIndex];
  if (last?.type === 'stage') {
    last.block = last.block
      ? { ...last.block, live }
      : { turnId, id: `work-${turnId}`, actionCount: 0, workIds: [], partial: false, live };

    return;
  }

  const liveStage: TranscriptStage = {
    type: 'stage',
    id: `live-${turnId}`,
    turnId,
    commentary: [],
    block: { turnId, id: `work-${turnId}`, actionCount: 0, workIds: [], partial: hasOlder, live },
  };
  const answer = last?.type === 'entry' && last.entry.kind === 'answer';
  const agent: TranscriptItem = { type: 'agent', id: `agent-${turnId}`, turnId };
  const introduced = items.some((item) => item.type === 'agent' && item.turnId === turnId);
  if (lastIndex === -1) {
    // The active Turn's own entries are not in the loaded window yet.
    items.push(agent, liveStage);
  } else if (answer) {
    items.splice(lastIndex, 0, liveStage);
  } else {
    items.splice(lastIndex + 1, 0, ...(introduced ? [] : [agent]), liveStage);
  }
}
