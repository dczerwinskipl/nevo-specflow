import { DocumentError, planPublicWorkspaceCloseOperation } from '@nevo/specflow-engine';
import { describe, expect, it, vi } from 'vitest';

import { createSpecsCommand } from './command';

// Opening the project and planning the Close are replaced: the preview's refusal output is under test.
vi.mock('@nevo/specflow-engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nevo/specflow-engine')>()),
  openSpecFlowEngine: vi.fn(() => Promise.resolve({})),
  withCheckoutQuiescence: vi.fn((engine: unknown) => engine),
  planPublicWorkspaceCloseOperation: vi.fn(),
}));
vi.mock('@nevo/specflow-runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nevo/specflow-runtime')>()),
  sessionStoreCheckoutQuiescence: vi.fn(),
}));
vi.mock('../engine-at', () => ({
  engineAt: vi.fn(() => Promise.resolve({ context: { project: { homeRoot: '/project' } } })),
}));

const WORKSPACE = '00000000-0000-4000-8000-000000000002';

describe('specs workspace close --preview', () => {
  it('prints a document commit refusal with its cause instead of an internal error', async () => {
    vi.mocked(planPublicWorkspaceCloseOperation).mockRejectedValue(
      new DocumentError('DOCUMENT_COMMITS_PENDING', 'Document commits are not finished.', {
        cause: 'commit-uncommitted',
      }),
    );
    const stdout: string[] = [];
    const stderr: string[] = [];
    const command = createSpecsCommand({
      cwd: '/project',
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    });
    command.exitOverride();

    await expect(
      command.parseAsync(['workspace', 'close', WORKSPACE, '--preview', '--json'], {
        from: 'user',
      }),
    ).rejects.toThrow('Document commits are not finished.');
    expect(stderr[0]).toBe(
      'DOCUMENT_COMMITS_PENDING: Document commits are not finished. (commit-uncommitted)',
    );
    expect(JSON.parse(stdout[0]!)).toMatchObject({
      error: { code: 'DOCUMENT_COMMITS_PENDING', details: { cause: 'commit-uncommitted' } },
    });
  });
});
