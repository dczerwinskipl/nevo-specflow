import { PRODUCT_CLI } from '../documents/agent-permission-rules';
import { AGENT_COMMANDS } from './agent-commands';

/**
 * The allowlist of a provider whose archetype entry lists none, or an empty one (D20): every product
 * CLI command of `AGENT_COMMANDS` (the broker still refuses a write outside the Turn's scope).
 * In-workspace reads need no rule: they do not prompt. Only Claude Code has a host-side allowlist;
 * a provider without one has no default.
 */
export function defaultAgentAllowlist(provider: string): readonly string[] {
  if (provider !== 'claude') {
    return [];
  }

  return Object.keys(AGENT_COMMANDS).map((path) => `Bash(${PRODUCT_CLI} ${path} *)`);
}
