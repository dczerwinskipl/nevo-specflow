import { describe, expect, it } from 'vitest';

import {
  checkAgentPermissionRule,
  isAllowlistedCliCommand,
  partitionAgentPermissionRules,
} from './agent-permission-rules';

describe('checkAgentPermissionRule', () => {
  it.each([
    'Read(src/**)',
    'Glob(docs/*.md)',
    'Grep(packages/**)',
    'Bash(nevo-specflow tasks list)',
    'Bash(nevo-specflow tasks list *)',
  ])('accepts %s', (rule) => expect(checkAgentPermissionRule(rule).kind).toBe('ok'));

  it.each([
    'Bash',
    'Bash(*)',
    'Bash()',
    'Bash(git status)',
    'Bash(nevo-specflow)',
    'Bash(nevo-specflow *)',
    'Bash(nevo-specflow:*)',
    'Bash(nevo-specflow workflow confirm *)',
    'Bash(nevo-specflow tasks list; rm -rf /)',
    'Bash(nevo-specflow tasks list $(whoami))',
    'bash(nevo-specflow tasks list *)',
    'Write',
    'write',
    'EDIT(src/**)',
    'webfetch',
    '*',
    'mcp__*',
    'Read',
    'Read(*)',
    'Read(**)',
    'Glob',
    'Grep()',
    'Read(//etc/**)',
    'Read(/etc/passwd)',
    'Read(C:/Users/x/**)',
    'Read(~/.ssh/**)',
    'Read(../outside/**)',
    'Grep(**/secret.txt)',
    'read(src/**)',
  ])('refuses %s as over-broad', (rule) =>
    expect(checkAgentPermissionRule(rule).kind).toBe('over-broad'),
  );

  it.each(['', 'Bash(', 'not a rule', ' Read', 'Unknown(x)'])('does not recognise %j', (rule) =>
    expect(checkAgentPermissionRule(rule).kind).toBe('unrecognised'),
  );

  it('partitions into applied and ignored rules', () => {
    const result = partitionAgentPermissionRules(['Read(src/**)', 'Write', 'Weird(x)']);

    expect(result.accepted).toEqual(['Read(src/**)']);
    expect(result.ignored.map((entry) => entry.rule)).toEqual(['Write', 'Weird(x)']);
  });
});

describe('isAllowlistedCliCommand', () => {
  const rules = ['Bash(nevo-specflow tasks list *)', 'Bash(nevo-specflow workflow actions)'];

  it.each([
    'nevo-specflow tasks list SPEC-1',
    'nevo-specflow tasks list SPEC-1 --json',
    'nevo-specflow tasks list',
    'nevo-specflow workflow actions',
  ])('approves %s', (command) => expect(isAllowlistedCliCommand(command, rules)).toBe(true));

  it.each([
    'nevo-specflow tasks list SPEC-1; rm x',
    'nevo-specflow tasks list SPEC-1 && rm x',
    'nevo-specflow tasks list SPEC-1 | sh',
    'nevo-specflow tasks list $(id)',
    'nevo-specflow tasks list `id`',
    'nevo-specflow tasks list SPEC-1 > out',
    'nevo-specflow tasks list SPEC-1\nrm x',
    'nevo-specflow tasks list *',
    'FOO=1 nevo-specflow tasks list SPEC-1',
    './nevo-specflow tasks list SPEC-1',
    '/usr/bin/nevo-specflow tasks list SPEC-1',
    ' nevo-specflow tasks list SPEC-1',
    'nevo-specflow tasks listing',
    'nevo-specflow workflow confirm SPEC-1',
    'nevo-specflow workflow actions SPEC-1',
    'nevo-specflow',
    'nevo-specflow\ttasks list SPEC-1',
    'nevo-specflow tasks list\tSPEC-1',
    'nevo-specflow tasks list SPEC-1',
    'nevo-specflow tasks list SPEC-1',
    'nevo-specflow tasks listSPEC-1',
    'FOO=1\tnevo-specflow tasks list SPEC-1',
    'nevo-specflow tasks list SPEC-1 --project-root /other',
    'nevo-specflow tasks list SPEC-1 --project-root=/other',
    'nevo-specflow tasks list SPEC-1 "--project-root" /other',
  ])('leaves %j to the owner', (command) =>
    expect(isAllowlistedCliCommand(command, rules)).toBe(false),
  );
});
