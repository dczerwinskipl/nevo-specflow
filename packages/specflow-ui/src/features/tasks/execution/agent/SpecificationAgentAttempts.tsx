import { useTranslation } from 'react-i18next';
import { Timeline, Typography } from '@nevo/ui';
import { useAppServices } from '../../../../app/useAppServices';
import { useSpecificationWorkspace } from '../../../specs/read-model';
import { useViewer } from '../useViewer';
import {
  AgentAttemptHistory,
  AgentAttemptMeta,
  attemptOutcome,
  historyDay,
  outcomeTextClass,
  type AgentHistoryItem,
  type HistoryItem,
} from './AgentAttemptHistory';
import { useWorkflowHistory } from './useWorkflowHistory';
import type { AttemptRef } from '../StartBlockerLines';

/** The attempts by the day they started, newest first (the history's own order). */
function byDay(
  attempts: readonly AgentHistoryItem[],
): { readonly key: string; readonly day: Date; readonly attempts: AgentHistoryItem[] }[] {
  const groups: { key: string; day: Date; attempts: AgentHistoryItem[] }[] = [];
  for (const item of attempts) {
    const day = new Date(item.startedAt);
    const key = Number.isNaN(day.getTime()) ? item.startedAt : day.toDateString();
    const last = groups.at(-1);
    if (last?.key === key) {
      last.attempts.push(item);
    } else {
      groups.push({ key, day, attempts: [item] });
    }
  }

  return groups;
}

/** The feedback an attempt's result or return left, if any. */
function feedbackOf(item: AgentHistoryItem): string | undefined {
  const outcome = item.outcome;

  return outcome?.kind === 'transition' || outcome?.kind === 'returned'
    ? outcome.feedback
    : undefined;
}

function AttemptEntry({
  item,
  items,
  specId,
  openDocument,
  feedbackOpen,
}: {
  readonly item: AgentHistoryItem;
  readonly items: readonly HistoryItem[];
  readonly specId: string;
  readonly openDocument?: ((path: string) => boolean) | undefined;
  readonly feedbackOpen: boolean;
}) {
  const { t } = useTranslation();
  const viewer = useViewer();
  const outcome = attemptOutcome(t, item, items, viewer);

  return (
    <Timeline.Item>
      <Timeline.Marker
        icon={outcome.icon}
        tone={outcome.tone}
        {...(outcome.iconClassName ? { iconClassName: outcome.iconClassName } : {})}
      />
      <Timeline.Content
        title={
          <span role="heading" aria-level={4}>
            {item.stepTitle || item.step}
          </span>
        }
      >
        <div className="grid min-w-0 gap-1 [overflow-wrap:anywhere]" data-attempt-entry="">
          <Typography
            as="p"
            variant="body-sm"
            className={outcomeTextClass(outcome)}
            data-attempt-outcome=""
          >
            {outcome.label}
          </Typography>
          {/* The day is the group's heading. */}
          <AgentAttemptMeta item={item} withDay={false} />
          <AgentAttemptHistory
            item={item}
            items={items}
            subject={{ specId }}
            feedback={feedbackOf(item)}
            feedbackOpen={feedbackOpen}
            showOutcome={false}
            {...(openDocument ? { openDocument } : {})}
          />
        </div>
      </Timeline.Content>
    </Timeline.Item>
  );
}

/**
 * The agent's attempts at the Specification's own steps (Breakdown and the like), newest first and
 * grouped by day, for the Specification's Activity history (workflow-execution.md, "Activity
 * history"): each entry is marked by how it ended, titled by its step, with its outcome, time and
 * attempt, the agent with Open session, what it changed and its commit; the full feedback is behind
 * View feedback (open for `feedback`, the attempt the reader came from Open full feedback for). What was achieved, not every event recorded. Nothing is shown while the Specification has no agent attempt
 * or its history cannot be read.
 */
export function SpecificationAgentAttempts({
  specId,
  onOpenDoc,
  feedback,
}: {
  readonly specId: string;
  /** The attempt whose feedback the reader opened from the Now block. */
  readonly feedback?: AttemptRef | undefined;
  /** Opens a registered document of the Specification by its id. */
  readonly onOpenDoc?: (docId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { specificationApi } = useAppServices();
  const workspace = useSpecificationWorkspace(specId, specificationApi).data;
  const history = useWorkflowHistory({ specId });
  const items = history.data?.items ?? [];
  const attempts = items.filter(
    (item): item is AgentHistoryItem => item.kind === 'attempt' && item.agent !== undefined,
  );
  if (attempts.length === 0) {
    return null;
  }

  // A changed document opens by its registry id: its path is the Specification folder + filename.
  const openDocument = onOpenDoc
    ? (path: string) => {
        const directory = attempts.find((item) => item.agent.work.changes?.directory)?.agent.work
          .changes?.directory;
        const found = workspace?.documents.find(
          (document) => document.filename && `${directory}/${document.filename}` === path,
        );
        if (!found) {
          return false;
        }

        onOpenDoc(found.id);

        return true;
      }
    : undefined;
  const now = new Date();

  return (
    <section
      className="grid min-w-0 gap-3 p-4"
      aria-label={t('workflowExecution.attemptHistory.title')}
    >
      <Typography as="h3" variant="label-sm">
        {t('workflowExecution.attemptHistory.title')}
      </Typography>
      {byDay(attempts).map((group) => (
        <div key={group.key} className="grid min-w-0 gap-2" data-attempt-day="">
          <Typography
            as="p"
            variant="label-sm"
            className="uppercase tracking-wide text-content-muted"
          >
            {historyDay(t, group.day, i18n.language, now)}
          </Typography>
          <Timeline size="md">
            {group.attempts.map((item) => (
              <AttemptEntry
                key={`${item.step}-${item.attempt}`}
                item={item}
                items={items}
                specId={specId}
                openDocument={openDocument}
                feedbackOpen={item.step === feedback?.step && item.attempt === feedback.attempt}
              />
            ))}
          </Timeline>
        </div>
      ))}
      {history.data?.truncated ? (
        <Typography as="p" variant="body-sm" className="text-content-muted">
          {t('workflowExecution.attemptHistory.truncated')}
        </Typography>
      ) : null}
    </section>
  );
}
