import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeGit } from '../../git/process';
import { createLocalGitClient } from './client';

vi.mock('../../git/process', () => ({ executeGit: vi.fn() }));

const commit = 'a'.repeat(40);
const regular = `100644 blob ${'b'.repeat(40)}\t.nevo/config.yaml\0`;
const result = (stdout: string, exitCode = 0) => ({ stdout, stderr: '', exitCode });

beforeEach(() => vi.resetAllMocks());

describe('committed base project configuration', () => {
  it.each([
    ['', '', 'missing'],
    [`120000 blob ${'b'.repeat(40)}\t.nevo/config.yaml\0`, 'runtime: {}', 'not-regular-file'],
    [`040000 tree ${'b'.repeat(40)}\t.nevo/config.yaml\0`, '', 'not-regular-file'],
    [regular, 'runtime: [', 'invalid-yaml'],
    [regular, 'runtime: []', 'runtime-missing'],
    [regular, 'runtime: null', 'runtime-missing'],
    [regular, 'docs: {}', 'runtime-missing'],
    [regular, '- runtime', 'runtime-missing'],
  ])('shares the %s / %s refusal between inspection and admission', async (tree, yaml, reason) => {
    vi.mocked(executeGit).mockImplementation((_home, args) =>
      Promise.resolve(result(args[0] === 'ls-tree' ? tree : yaml)),
    );
    const client = createLocalGitClient('/project');
    await expect(client.inspectBaseProjectConfig(commit)).resolves.toEqual({
      status: 'unusable',
      reason,
    });
    await expect(client.verifyBaseProjectConfig(commit)).rejects.toMatchObject({
      code: 'GIT_BASE_CONFIG_MISSING',
      reason,
    });
    expect(
      vi
        .mocked(executeGit)
        .mock.calls.every(
          ([, args]) => args.includes(commit) || args.includes(commit + ':.nevo/config.yaml'),
        ),
    ).toBe(true);
  });

  it.each(['runtime: {}', 'runtime:\n  projectId: example'])(
    'accepts %s in both paths',
    async (yaml) => {
      vi.mocked(executeGit).mockImplementation((_home, args) =>
        Promise.resolve(result(args[0] === 'ls-tree' ? regular : yaml)),
      );
      const client = createLocalGitClient('/project');
      await expect(client.inspectBaseProjectConfig(commit)).resolves.toEqual({ status: 'usable' });
      await expect(client.verifyBaseProjectConfig(commit)).resolves.toBeUndefined();
    },
  );

  it.each(['ls-tree', 'show'])(
    'does not turn a failed %s read into missing configuration',
    async (command) => {
      vi.mocked(executeGit).mockImplementation((_home, args) =>
        Promise.resolve(args[0] === command ? result('', 128) : result(regular)),
      );
      await expect(
        createLocalGitClient('/project').inspectBaseProjectConfig(commit),
      ).rejects.toMatchObject({
        code: 'GIT_OPERATION_FAILED',
      });
    },
  );
});
