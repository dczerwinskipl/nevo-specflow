import { describe, expect, it } from 'vitest';

import { partitionAgentPermissionRules } from '../documents/agent-permission-rules';
import { AGENT_COMMANDS } from './agent-commands';
import { defaultAgentAllowlist } from './agent-permissions';

describe('defaultAgentAllowlist', () => {
  it('derives a CLI rule per command of the agent command table and passes its own check', () => {
    const rules = defaultAgentAllowlist('claude');

    expect(rules.every((rule) => rule.startsWith('Bash(nevo-specflow '))).toBe(true);
    for (const path of Object.keys(AGENT_COMMANDS)) {
      expect(rules).toContain(`Bash(nevo-specflow ${path} *)`);
    }

    expect(rules.length).toBeLessThanOrEqual(64);
    expect(partitionAgentPermissionRules(rules).ignored).toEqual([]);
  });

  it('has no default for a provider without an allowlist', () => {
    expect(defaultAgentAllowlist('codex')).toEqual([]);
  });
});
