import { cn } from '@nevo/ui';
import { agentDisplayName, agentNameParts, type AgentNameSource } from './agentDisplayName';

/**
 * An agent's name on a line that never wraps, beside the provider's mark: "Claude Code · Opus 5.5"
 * where it fits, else the model alone (the mark stands for the tool), never a cut name
 * (workflow-execution.md, "Naming the agent"). The whole name stays the accessible name and the
 * tooltip.
 *
 * The two parts sit in one line-high row that wraps, in reading order in the document. The model is
 * laid out first (`order`) and the row runs in reverse, so the tool still reads first and, when
 * both do not fit, the tool's part is the one that wraps out of sight.
 */
export function AgentName({
  agent,
  className,
}: {
  readonly agent: AgentNameSource;
  readonly className?: string;
}) {
  const name = agentDisplayName(agent);
  const { provider, model } = agentNameParts(agent);

  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className={cn(
        'flex h-[1lh] min-w-0 flex-row-reverse flex-wrap justify-end overflow-hidden',
        className,
      )}
      data-agent-name=""
    >
      {provider ? (
        <span aria-hidden="true" className="whitespace-pre" data-agent-provider="">
          {model ? `${provider} · ` : provider}
        </span>
      ) : null}
      {model ? (
        <span aria-hidden="true" className="-order-1 min-w-0 truncate" data-agent-model="">
          {model}
        </span>
      ) : null}
    </span>
  );
}
