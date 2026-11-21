import type { AgentOption } from '@nevo/specflow-contracts/workflow';
import { workflowRefusalOf } from '../refusal';

/** The unavailable form of an agent option (its reason and the facts that explain it). */
export type UnavailableAgent = Extract<AgentOption, { kind: 'unavailable' }>;

/**
 * The agent role's name for people: the archetype id as words ("security-reviewer" becomes
 * "Security reviewer"). The projection carries the id only; no read model has a title for it yet.
 */
export function archetypeTitle(archetype: string): string {
  const words = archetype.replace(/[-_]+/g, ' ').trim();

  return words === '' ? archetype : words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Whether the Now block offers Run with agent: the step's executors include an agent. Unavailable
 * agents stay offered (the dialog explains why before anything is sent); only `not-an-executor`
 * means the step is not an agent's.
 */
export function offersAgent(option: AgentOption | undefined): boolean {
  return (
    option !== undefined && !(option.kind === 'unavailable' && option.reason === 'not-an-executor')
  );
}

/** The reasons whose fix is a choice of agent and model in the project's agent settings. */
export const NO_AGENT_REASONS = [
  'archetype-missing',
  'provider-not-chosen',
  'model-missing',
] as const;

/**
 * The agent option a refused start leaves the dialog with: the refusal's own (`details.agent`), or
 * the dirty checkout its attribution names. Another refusal says nothing about the agent.
 */
export function optionOfRefusal(error: unknown): AgentOption | undefined {
  const refusal = workflowRefusalOf(error);
  if (refusal.agent) {
    return refusal.agent;
  }

  if (refusal.code === 'WORKFLOW_DIRTY_BASELINE' && refusal.attribution) {
    return {
      kind: 'unavailable',
      reason: 'dirty-baseline',
      paths: refusal.attribution.paths,
      count: refusal.attribution.count,
    };
  }

  return undefined;
}
