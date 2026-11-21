import { describe, expect, it } from 'vitest';

import { checkAgentPermissionRule, partitionAgentPermissionRules } from './agent-permission-rules';

describe('checkAgentPermissionRule', () => {
  it.each([
    'Read',
    'Glob',
    'Grep',
    'Read(src/**)',
    'Bash(nevo-specflow specs list *)',
    'Bash(nevo-specflow:*)',
  ])('accepts %s', (rule) => expect(checkAgentPermissionRule(rule).kind).toBe('ok'));

  it.each([
    'Bash',
    'Bash(*)',
    'Bash()',
    'Bash(git status)',
    'Bash(nevo-specflowx *)',
    'Bash(nevo-specflow specs list; rm -rf /)',
    'Bash(nevo-specflow $(whoami))',
    'Write',
    'Edit(src/**)',
    'WebFetch',
    '*',
    'mcp__*',
  ])('refuses %s as over-broad', (rule) =>
    expect(checkAgentPermissionRule(rule).kind).toBe('over-broad'),
  );

  it.each(['', 'Bash(', 'not a rule', ' Read', 'Unknown(x)'])('does not recognise %j', (rule) =>
    expect(checkAgentPermissionRule(rule).kind).toBe('unrecognised'),
  );

  it('partitions into applied and ignored rules', () => {
    const result = partitionAgentPermissionRules(['Read', 'Write', 'Weird(x)']);

    expect(result.accepted).toEqual(['Read']);
    expect(result.ignored.map((entry) => entry.rule)).toEqual(['Write', 'Weird(x)']);
  });
});
