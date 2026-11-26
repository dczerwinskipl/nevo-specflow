import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Typography, cn, hitAreaBlockClassName, type StatusTone } from '@nevo/ui';
import { SessionProviderIcon } from '../../sessions';
import { AgentName } from '../../../shared/agents/AgentName';
import type { AgentNameSource } from '../../../shared/agents/agentDisplayName';
import { SessionLink } from './agent/AgentSession';

/** The status tone of the executor's state line (interaction-model.md "Visual conventions"). */
const stateToneClassName: Record<StatusTone, string> = {
  neutral: 'text-content-secondary',
  info: 'text-status-info',
  success: 'text-status-success',
  attention: 'text-status-attention',
  danger: 'text-content-error',
};

/**
 * Who works on the step now, one shared piece of the Now block of a Specification and of a Task
 * (interaction-model.md "Visual conventions", Now composition): the provider's mark, the agent as
 * every screen names it ("Claude Code · Opus 5.5"), the state of its work in its status tone under
 * it, and "Open session" as the text action to its Session. The same row for every state of an
 * agent's attempt (working, waiting for the owner, stopped, interrupted, unknown): only the state
 * line and its tone change, never the composition.
 */
export function NowExecutor({
  agent,
  state,
  tone,
  sessionId,
  sessionGone = false,
}: {
  readonly agent: AgentNameSource & { readonly provider: string };
  readonly state: ReactNode;
  readonly tone: StatusTone;
  /** The agent's Session; without one there is no Open session. */
  readonly sessionId?: string | undefined;
  /** The Session no longer exists: said in place of the action. */
  readonly sessionGone?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex min-w-0 items-start gap-3" data-now-executor="">
      <span className="flex h-6 shrink-0 items-center">
        <SessionProviderIcon providerId={agent.provider} />
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <AgentName agent={agent} className="text-body-md font-medium text-content-primary" />
        <Typography
          as="p"
          variant="body-sm"
          className={cn('[overflow-wrap:anywhere]', stateToneClassName[tone])}
          data-now-executor-state={tone}
        >
          {state}
        </Typography>
      </div>
      {sessionId && !sessionGone ? (
        <SessionLink
          sessionId={sessionId}
          title={t('workflowExecution.now.openSession')}
          className={cn('shrink-0 text-body-sm leading-6 whitespace-nowrap', hitAreaBlockClassName)}
        />
      ) : sessionGone ? (
        <Typography
          as="span"
          variant="body-sm"
          className="shrink-0 leading-6 whitespace-nowrap text-content-muted"
        >
          {t('workflowExecution.now.sessionGone')}
        </Typography>
      ) : null}
    </div>
  );
}
