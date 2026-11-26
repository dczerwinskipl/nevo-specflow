import { Typography } from '@nevo/ui';
import { SessionProviderIcon } from '../../shared/SessionProviderIcon';
import { agentNameParts, type AgentNameSource } from '../../../../shared/agents/agentDisplayName';

/**
 * Who answers from here on (full-session.md "Conversation"): one quiet line before the first agent
 * output of a Turn, "Claude Code · Opus 5.5", with the provider's mark. The Session's executor,
 * named by the shared formatter ({@link agentNameParts}: the Session's own titles, then the
 * catalogue's, then the ids); never repeated on every entry of the Turn.
 */
export function AgentIdentity({
  agent,
}: {
  agent: AgentNameSource & { readonly provider: string };
}) {
  const { provider, model } = agentNameParts(agent);

  return (
    <Typography
      as="p"
      variant="body-sm"
      data-agent-identity=""
      className="flex min-w-0 items-center gap-2 text-content-secondary"
    >
      <SessionProviderIcon providerId={agent.provider} />
      <span className="min-w-0 truncate">
        <span className="font-medium text-content-primary">{provider}</span>
        {model ? ` · ${model}` : ''}
      </span>
    </Typography>
  );
}
