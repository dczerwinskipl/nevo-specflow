import { describe, expect, it } from 'vitest';
import { nativeToolOperation } from './tool-operations';
import { claudeToolOperations } from './claude/protocol';
import { codexToolOperations } from './codex/protocol';
import { antigravityToolOperations } from './antigravity/protocol';

describe('native tool operation classification', () => {
  it('pins each provider mapping to its own native tool identities', () => {
    expect(claudeToolOperations).toEqual({
      Read: 'read',
      Glob: 'search',
      Grep: 'search',
      Edit: 'edit',
      Write: 'write',
      Bash: 'command',
    });
    expect(codexToolOperations).toEqual({ commandExecution: 'command', fileChange: 'edit' });
    expect(antigravityToolOperations).toEqual({
      view_file: 'read',
      list_dir: 'list',
      find_by_name: 'search',
      grep_search: 'search',
      write_to_file: 'write',
      replace_file_content: 'edit',
      multi_replace_file_content: 'edit',
      run_command: 'command',
    });
  });
  it('falls back to other for unlisted, differently cased or inherited identities', () => {
    for (const identity of ['AskUserQuestion', 'bash', 'run_tests', 'constructor', '__proto__']) {
      expect(nativeToolOperation(claudeToolOperations, identity)).toBe('other');
    }

    // No provider tool identifies a test run, so `test` is never inferred from a command.
    for (const table of [claudeToolOperations, codexToolOperations, antigravityToolOperations]) {
      expect(Object.values(table)).not.toContain('test');
    }
  });
});
