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

/**
 * The Runtime's reason for a launch whose model the provider does not offer (`detail` names the
 * configured model and the closest offered one). Compared as a string: the contract adds it with
 * the Runtime's model check.
 */
export const MODEL_NOT_OFFERED = 'model-not-offered';

/** The reasons whose fix is a choice of agent and model in the project's agent settings. */
export const NO_AGENT_REASONS = [
  'archetype-missing',
  'provider-not-chosen',
  'model-missing',
] as const;

/** The refusals whose attribution is the agent option's blocker (the paths it names). */
const ATTRIBUTION_REASONS = {
  WORKFLOW_DIRTY_BASELINE: 'dirty-baseline',
  WORKFLOW_OWNER_WORK_UNCOMMITTED: 'owner-work-uncommitted',
} as const satisfies Record<string, UnavailableAgent['reason']>;

/**
 * The agent option a refused start leaves the dialog with: the refusal's own (`details.agent`), or
 * the uncommitted changes its attribution names (a dirty checkout, or the owner's work a hand to the
 * agent would give away). Another refusal says nothing about the agent.
 */
export function optionOfRefusal(error: unknown): AgentOption | undefined {
  const refusal = workflowRefusalOf(error);
  if (refusal.agent) {
    return refusal.agent;
  }

  const reason =
    refusal.code !== undefined && refusal.code in ATTRIBUTION_REASONS
      ? ATTRIBUTION_REASONS[refusal.code as keyof typeof ATTRIBUTION_REASONS]
      : undefined;
  if (reason !== undefined && refusal.attribution) {
    return {
      kind: 'unavailable',
      reason,
      paths: refusal.attribution.paths,
      count: refusal.attribution.count,
    };
  }

  return undefined;
}
