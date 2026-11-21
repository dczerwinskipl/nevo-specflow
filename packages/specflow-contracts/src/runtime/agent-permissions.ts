import { AGENT_READ_TOOLS, PRODUCT_CLI } from '../documents/agent-permission-rules';
import { AGENT_COMMANDS } from './agent-commands';

/**
 * The allowlist of a provider whose archetype entry lists none (D20): read-only file and search
 * tools plus every product CLI command of `AGENT_COMMANDS` (the broker still refuses a write outside
 * the Turn's scope). Only Claude Code reads a rule list; a provider without one has no default.
 */
export function defaultAgentAllowlist(provider: string): readonly string[] {
  if (provider !== 'claude') {
    return [];
  }

  return [
    ...AGENT_READ_TOOLS,
    ...Object.keys(AGENT_COMMANDS).map((path) => `Bash(${PRODUCT_CLI} ${path} *)`),
  ];
}
