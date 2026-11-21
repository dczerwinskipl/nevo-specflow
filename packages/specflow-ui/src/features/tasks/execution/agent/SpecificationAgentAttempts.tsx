import { useTranslation } from 'react-i18next';
import { Timeline, Typography } from '@nevo/ui';
import { formatWhen } from '../presentation';
import { AgentAttemptHistory, type AgentHistoryItem } from './AgentAttemptHistory';
import { useWorkflowHistory } from './useWorkflowHistory';

/**
 * The agent's attempts at the Specification's own steps (Breakdown and the like), newest first, for
 * the Specification's history: the same attempt detail as a Task's history. Nothing is shown while
 * the Specification has no agent attempt or its history cannot be read.
 */
export function SpecificationAgentAttempts({ specId }: { readonly specId: string }) {
  const { t, i18n } = useTranslation();
  const history = useWorkflowHistory({ specId });
  const items = history.data?.items ?? [];
  const attempts = items.filter(
    (item): item is AgentHistoryItem => item.kind === 'attempt' && item.agent !== undefined,
  );
  if (attempts.length === 0) {
    return null;
  }

  return (
    <section
      className="grid min-w-0 gap-3 p-4"
      aria-label={t('workflowExecution.attemptHistory.title')}
    >
      <Typography as="h3" variant="label-sm">
        {t('workflowExecution.attemptHistory.title')}
      </Typography>
      <Timeline size="md">
        {attempts.map((item) => (
          <Timeline.Item key={`${item.step}-${item.attempt}`}>
            <Timeline.Marker tone={item.agent.ended === 'active' ? 'info' : 'neutral'} />
            <Timeline.Content
              title={
                <span role="heading" aria-level={4}>
                  {item.stepTitle || item.step}
                </span>
              }
            >
              <div className="grid min-w-0 gap-1 [overflow-wrap:anywhere]">
                <AgentAttemptHistory item={item} items={items} subject={{ specId }} />
                <Typography as="p" variant="body-sm" className="text-content-muted">
                  {[
                    formatWhen(t, item.endedAt ?? item.startedAt, i18n.language),
                    t('taskDetails.attempt', { count: item.attempt }),
                  ].join(' · ')}
                </Typography>
              </div>
            </Timeline.Content>
          </Timeline.Item>
        ))}
      </Timeline>
      {history.data?.truncated ? (
        <Typography as="p" variant="body-sm" className="text-content-muted">
          {t('workflowExecution.attemptHistory.truncated')}
        </Typography>
      ) : null}
    </section>
  );
}
