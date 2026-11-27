import { describe, expect, it } from 'vitest';

import {
  checkAgentPermissionRule,
  judgeAgentCliCommand,
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

describe('judgeAgentCliCommand', () => {
  const rules = [
    'Bash(nevo-specflow tasks list *)',
    'Bash(nevo-specflow workflow actions)',
    'Bash(nevo-specflow specs documents save *)',
    'Bash(nevo-specflow workflow finish *)',
  ];
  const judge = (command: string) => judgeAgentCliCommand(command, rules);

  it.each([
    'nevo-specflow tasks list SPEC-1',
    'nevo-specflow tasks list SPEC-1 --json',
    'nevo-specflow tasks list',
    'nevo-specflow workflow actions',
    // A real parse: blanks are any run of spaces or tabs, as the shell splits words.
    ' nevo-specflow tasks list SPEC-1',
    'nevo-specflow\ttasks list SPEC-1',
    // Lists of calls joined by &&, ; or new lines.
    'nevo-specflow tasks list S && nevo-specflow workflow actions',
    'nevo-specflow tasks list S; nevo-specflow workflow actions;',
    'nevo-specflow tasks list S\nnevo-specflow workflow actions\n',
    'nevo-specflow tasks list S &&\n  nevo-specflow workflow actions',
    'nevo-specflow tasks list S \\\n  --json',
    // Quoting: parentheses, semicolons, pipes, globs and dollars are literal inside quotes.
    'nevo-specflow workflow finish S --step a --attempt 1 --feedback "Owner confirmed (A-E); see D4 | D5 * ok"',
    "nevo-specflow workflow finish S --step a --attempt 1 --feedback 'costs $5 and `nothing`'",
    'nevo-specflow workflow finish S --step a --attempt 1 --feedback "say \\"hi\\" \\$HOME"',
    "nevo-specflow workflow finish S --step a --attempt 1 --feedback 'it'\\''s fine'",
    'nevo-specflow workflow finish S --step a --attempt 1 --feedback ""',
    'nevo-specflow workflow finish S --step a --attempt 1 --feedback "zażółć gęślą jaźń"',
    // Output to /dev/null and descriptor duplicates.
    'nevo-specflow tasks list S 2>&1',
    'nevo-specflow tasks list S 2>/dev/null',
    // A here-document with a quoted delimiter is literal stdin.
    "nevo-specflow specs documents save S overview --expected-revision r --stdin <<'EOF'\n# $Title `x` $(id)\nEOF",
    'nevo-specflow specs documents save S overview --expected-revision r --stdin <<"EOF"\nbody\nEOF\nnevo-specflow tasks list S',
  ])('allowlists %j', (command) => expect(judge(command).kind).toBe('allowlisted'));

  it('returns the leading absolute cd, the outputs and the read files for the host to check', () => {
    expect(
      judge(
        'cd "/work/my repo" && nevo-specflow specs documents save S d --expected-revision r --content-file .nevo/local/scratch/d.md > .nevo/local/scratch/out.json 2>&1 < in.txt',
      ),
    ).toEqual({
      kind: 'allowlisted',
      paths: {
        cd: '/work/my repo',
        outputs: ['.nevo/local/scratch/out.json'],
        inputs: ['.nevo/local/scratch/d.md', 'in.txt'],
      },
    });
    expect(judge('cd C:\\\\work\\\\repo; nevo-specflow tasks list S')).toEqual({
      kind: 'allowlisted',
      paths: { cd: 'C:\\work\\repo', outputs: [], inputs: [] },
    });
    expect(
      judge('nevo-specflow workflow finish S --step b --attempt 1 --tasks-file=C:/w/t.yaml'),
    ).toEqual({
      kind: 'allowlisted',
      paths: { outputs: [], inputs: ['C:/w/t.yaml'] },
    });
  });

  it.each([
    // cd options all go to $HOME (or behave unlike a folder change); relative cd follows CDPATH.
    'cd -P && nevo-specflow tasks list S',
    'cd -L && nevo-specflow tasks list S',
    'cd -e && nevo-specflow tasks list S',
    'cd -@ && nevo-specflow tasks list S',
    'cd -- && nevo-specflow tasks list S',
    'cd -P /work && nevo-specflow tasks list S',
    'cd specs && nevo-specflow tasks list S',
    'cd ./specs && nevo-specflow tasks list S',
    'cd ../x && nevo-specflow tasks list S',
    // Tilde after = (bash expands it in assignment-like words), and anywhere unquoted.
    'nevo-specflow tasks list a=~/x',
    'nevo-specflow tasks list --content-file=~/.ssh/id_rsa',
    'nevo-specflow tasks list x:~/y',
    // A file option without its file.
    'nevo-specflow tasks list S --content-file',
    'nevo-specflow tasks list S --content-file=',
  ])('refuses %j', (command) => expect(judge(command).kind).toBe('not-allowlisted'));

  it.each([
    'nevo-specflow tasks list SPEC-1; rm x',
    'nevo-specflow tasks list SPEC-1 && rm x',
    'rm x; nevo-specflow tasks list SPEC-1',
    'nevo-specflow tasks list SPEC-1 | sh',
    'nevo-specflow tasks list SPEC-1 | head -5',
    'nevo-specflow tasks list SPEC-1 || rm x',
    'nevo-specflow tasks list SPEC-1 & rm x',
    'nevo-specflow tasks list SPEC-1 &',
    'nevo-specflow tasks list $(id)',
    'nevo-specflow tasks list `id`',
    'nevo-specflow tasks list "$(id)"',
    'nevo-specflow tasks list "`id`"',
    'nevo-specflow tasks list $S',
    'nevo-specflow tasks list ${S}',
    'nevo-specflow tasks list "$S"',
    'S=1; nevo-specflow tasks list S',
    'S=1 nevo-specflow tasks list S',
    'FOO=1 nevo-specflow tasks list SPEC-1',
    'FOO=1\tnevo-specflow tasks list SPEC-1',
    'env nevo-specflow tasks list S',
    'command nevo-specflow tasks list S',
    'nevo-specflow tasks list SPEC-1\nrm x',
    'nevo-specflow tasks list *',
    'nevo-specflow tasks list S?',
    'nevo-specflow tasks list [ab]',
    'nevo-specflow tasks list {a,b}',
    'nevo-specflow tasks list ~/x',
    'nevo-specflow tasks list S # comment',
    '! nevo-specflow tasks list S',
    '(nevo-specflow tasks list S)',
    '{ nevo-specflow tasks list S; }',
    'nevo-specflow tasks list <(id)',
    'nevo-specflow tasks list <<< text',
    'nevo-specflow tasks list S <<EOF\n$(id)\nEOF',
    "nevo-specflow tasks list S <<-'EOF'\nx\nEOF",
    "nevo-specflow tasks list S <<'EOF'\nnever ends",
    'nevo-specflow tasks list S >&file',
    'nevo-specflow tasks list S &> out',
    'nevo-specflow tasks list S >| out',
    'nevo-specflow tasks list S <> out',
    'nevo-specflow tasks list "unterminated',
    "nevo-specflow tasks list 'unterminated",
    'nevo-specflow tasks list S\\',
    'nevo-specflow tasks list S\r\nrm x',
    'nevo-specflow tasks list S\u0000',
    'nevo-specflow tasks list S ;; nevo-specflow workflow actions',
    '; nevo-specflow tasks list S',
    'nevo-specflow tasks list S &&',
    'nevo-specflow tasks list S\n&& nevo-specflow workflow actions',
    'cd x',
    'cd x | nevo-specflow tasks list S',
    'nevo-specflow tasks list S && cd x && nevo-specflow tasks list S',
    'cd x && cd y && nevo-specflow tasks list S',
    'cd - && nevo-specflow tasks list S',
    'cd x y && nevo-specflow tasks list S',
    'cd x > out && nevo-specflow tasks list S',
    './nevo-specflow tasks list SPEC-1',
    '/usr/bin/nevo-specflow tasks list SPEC-1',
    'nevo-specflow tasks listing',
    'nevo-specflow tasks listSPEC-1',
    'nevo-specflow workflow confirm SPEC-1',
    'nevo-specflow workflow actions SPEC-1',
    'nevo-specflow',
    'nevo-specflow\u00a0tasks list SPEC-1',
    'nevo-specflow tasks list\u00a0SPEC-1',
    'nevo-specflow tasks list SPEC-1 --project-root /other',
    'nevo-specflow tasks list SPEC-1 --project-root=/other',
    'nevo-specflow tasks list SPEC-1 "--project-root" /other',
    "nevo-specflow tasks list SPEC-1 '--worktree=x'",
    'nevo-specflow tasks list S > ""',
    '',
    '   ',
  ])('leaves %j to the owner', (command) => expect(judge(command).kind).toBe('not-allowlisted'));
});
