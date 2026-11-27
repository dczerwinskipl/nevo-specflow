/** A recorded model's display name: the provider's title for it, else the id (`useModelTitle`). */
export type ModelTitle = (
  providerId: string | undefined,
  modelId: string | undefined,
) => string | undefined;

/** The provider catalogue's titles: of a provider (the tool) and of its models. */
export interface AgentTitleCatalogue {
  readonly provider?: ((providerId: string) => string | undefined) | undefined;
  readonly model?: ModelTitle | undefined;
}

/** What an agent is named from ({@link agentDisplayName}). */
export interface AgentNameSource {
  readonly provider: string | undefined;
  /** The tool's title as the attempt recorded it or its Session reports it ("Claude Code"). */
  readonly providerTitle?: string | undefined;
  /** The model id the attempt (or its actor) recorded. */
  readonly model?: string | undefined;
  /** The model's title as the attempt recorded it or its Session reports it ("Opus 5.5"). */
  readonly modelTitle?: string | undefined;
  /** The model's effort, where the choice names one ("high"): it follows the model, as the picker shows it. */
  readonly effort?: string | undefined;
  readonly catalogue?: AgentTitleCatalogue | undefined;
}

/**
 * An agent's two parts: the provider (the tool) and the model, each by one source order
 * (workflow-execution.md, "Naming the agent"): what the attempt or its Session actually ran, then
 * the provider catalogue's title, then the id (a provider's made readable).
 */
export function agentNameParts(agent: AgentNameSource): {
  readonly provider: string | undefined;
  readonly model: string | undefined;
} {
  const provider =
    agent.providerTitle ??
    (agent.provider
      ? (agent.catalogue?.provider?.(agent.provider) ?? readableProvider(agent.provider))
      : undefined);
  const model =
    agent.modelTitle ?? agent.catalogue?.model?.(agent.provider, agent.model) ?? agent.model;

  return { provider, model };
}

/**
 * An agent as every screen names it, "Claude Code · Opus 5.5": the tool, then the model
 * ({@link agentNameParts}) and, when given, its effort ("Claude Code · Opus 5.5 · high"). The one formatter of the Now block, the work history, the Run with
 * agent dialog, the Task history and the Session's own agent line. Where a line is too short for it, the provider's mark stands
 * for the tool and the model is shown alone ({@link AgentName}), the whole name kept accessible.
 */
export function agentDisplayName(agent: AgentNameSource): string {
  const { provider, model } = agentNameParts(agent);

  return [provider, model, model ? agent.effort : undefined].filter(Boolean).join(' · ');
}

/** A provider's id made readable, `claude` is "Claude": the fallback when no title names it. */
function readableProvider(provider: string): string {
  const words = provider.replace(/[-_.]+/g, ' ').trim();

  return words ? words[0]!.toUpperCase() + words.slice(1) : provider;
}
