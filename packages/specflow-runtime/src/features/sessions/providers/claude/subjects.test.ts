import { describe, expect, it } from 'vitest';
import { claudeToolError, claudeToolSubject, firstLine, workspacePath } from './subjects';

const workspace = String.raw`C:\Users\owner\project\worktree`;

describe('Claude tool subjects', () => {
  it('names a file by its workspace-relative path and never by a home directory', () => {
    expect(workspacePath(String.raw`C:\Users\owner\project\worktree\src\job.sh`, workspace)).toBe(
      'src/job.sh',
    );
    expect(workspacePath('c:/users/owner/project/worktree/a.md', workspace)).toBe('a.md');
    expect(workspacePath(String.raw`C:\Users\owner\other\deep\file.txt`, workspace)).toBe(
      '…/deep/file.txt',
    );
    expect(workspacePath('/tmp/x', '/home/me/ws')).toBe('/tmp/x');
    expect(workspacePath('/home/me/ws/a/b.ts', '/home/me/ws')).toBe('a/b.ts');
  });

  it('names each known tool by what it acts on', () => {
    const file = { file_path: workspace + String.raw`\dummy\job.sh`, content: 'x' };
    expect(claudeToolSubject('Write', file, workspace)).toBe('dummy/job.sh');
    expect(claudeToolSubject('Edit', file, workspace)).toBe('dummy/job.sh');
    expect(
      claudeToolSubject('Bash', { command: 'mkdir -p /tmp/job && cd /tmp/job\necho hi' }),
    ).toBe('mkdir -p /tmp/job && cd /tmp/job …');
    expect(
      claudeToolSubject('Grep', { pattern: 'TODO', path: workspace + String.raw`\src` }, workspace),
    ).toBe('TODO · src');
    expect(claudeToolSubject('WebFetch', { url: 'https://example.com' })).toBe(
      'https://example.com',
    );
    expect(claudeToolSubject('Unknown', {})).toBeUndefined();
  });

  it('keeps a failure reason short, unwrapped and workspace-relative', () => {
    expect(
      claudeToolError(
        '<tool_use_error>File has not been read yet: ' +
          workspace +
          String.raw`\job.sh` +
          '\nmore</tool_use_error>',
        workspace,
      ),
    ).toBe('File has not been read yet: job.sh …');
    expect(firstLine('x'.repeat(400), 10)).toBe('xxxxxxxxx…');
  });
});
