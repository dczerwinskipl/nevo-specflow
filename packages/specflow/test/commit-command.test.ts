// Command adapters of `commit` and `commit status`, in process, against a stub of the Engine capabilities.
import {
  DocumentError,
  type ManualCommitCommand,
  type ManualCommitCommandResult,
  type UncommittedScopeView,
} from '@nevo/specflow-engine';
import { CommanderError } from 'commander';
import { describe, expect, it } from 'vitest';

import type { CommitEngineApi } from '../src/commit/api';
import { ReportedFailure, commanderExitCode } from '../src/exit-code';
import { createProgram } from '../src/program';

const SPEC = '11111111-1111-4111-8111-111111111111';
const OP = '22222222-2222-4222-8222-222222222222';
const SHA = '0123456789abcdef0123456789abcdef01234567';
const ENGINE = { tag: 'engine' } as never;

const COMMITTED: ManualCommitCommandResult = {
  operationId: OP,
  commit: { state: 'committed', sha: SHA },
  paths: ['specs/active/hand/a.md', 'specs/active/hand/b.md'],
  remaining: { entries: 0, ledgerRevision: 'r'.repeat(64) },
  replayed: false,
};

const VIEW: UncommittedScopeView = {
  scope: 'specification',
  ledgerRevision: 'a'.repeat(64),
  policy: { documents: 'manual', source: 'local' },
  entries: [
    {
      path: 'specs/active/hand/a.md',
      reason: 'auto-commit-off',
      recordedAt: '2026-10-27T10:00:00.000Z',
      operations: 2,
      owner: SPEC,
    },
  ],
  queue: { pending: 0, failed: 0, recoveryRequired: 0 },
};

interface Calls {
  readonly names: string[];
  readonly commits: ManualCommitCommand[];
  readonly views: Pick<ManualCommitCommand, 'scope' | 'specId'>[];
  readonly opened: { cwd: string; projectRoot: string | undefined }[];
}

function stubApi(overrides: Partial<CommitEngineApi> = {}): { api: CommitEngineApi; calls: Calls } {
  const calls: Calls = { names: [], commits: [], views: [], opened: [] };
  const api: CommitEngineApi = {
    openEngine: (cwd, projectRoot) => {
      calls.names.push('openEngine');
      calls.opened.push({ cwd, projectRoot });
      return Promise.resolve(ENGINE);
    },
    resolveSpecification: (_engine, reference) => {
      calls.names.push('resolveSpecification');
      if (reference === 'missing') {
        return Promise.reject(new DocumentError('DOCUMENT_NOT_FOUND', 'No Specification.'));
      }
      return Promise.resolve({ specId: SPEC, slug: 'hand' });
    },
    commit: (_engine, command) => {
      calls.names.push('commit');
      calls.commits.push(command);
      return Promise.resolve(COMMITTED);
    },
    uncommitted: (_engine, command) => {
      calls.names.push('uncommitted');
      calls.views.push(command);
      return Promise.resolve(VIEW);
    },
    ...overrides,
  };
  return { api, calls };
}

interface Run {
  readonly out: string[];
  readonly err: string[];
  readonly exit: number;
}

async function run(api: CommitEngineApi, args: string[], cwd = '.'): Promise<Run> {
  const out: string[] = [];
  const err: string[] = [];
  const program = createProgram({
    cwd,
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
    commitApi: api,
  });
  try {
    await program.parseAsync(['node', 'nevo-specflow', 'commit', ...args]);
    return { out, err, exit: 0 };
  } catch (error) {
    if (error instanceof CommanderError) return { out, err, exit: commanderExitCode(error) };
    if (error instanceof ReportedFailure) return { out, err, exit: error.exitCode };
    throw error;
  }
}

type ErrorCode = ConstructorParameters<typeof DocumentError>[0];
type ErrorDetails = ConstructorParameters<typeof DocumentError>[2];

const refuse = (error: Error): CommitEngineApi =>
  stubApi({ commit: () => Promise.reject(error) }).api;

describe('commit', () => {
  it('commits the Specification by slug with the message, the subset and the revision', async () => {
    const { api, calls } = stubApi();

    const result = await run(
      api,
      [
        '--spec',
        'hand',
        '-m',
        'Update the notes',
        '-m',
        'Second paragraph',
        '--path',
        'specs/active/hand/a.md',
        '--path',
        'specs/active/hand/b.md',
        '--ledger-revision',
        'abc',
        '--operation-id',
        OP,
        '--project-root',
        '/project',
      ],
      '/work',
    );

    expect(result.exit, result.err.join('\n')).toBe(0);
    expect(calls.opened).toEqual([{ cwd: '/work', projectRoot: '/project' }]);
    expect(calls.commits).toEqual([
      {
        operationId: OP,
        scope: 'specification',
        specId: SPEC,
        message: 'Update the notes\n\nSecond paragraph',
        paths: ['specs/active/hand/a.md', 'specs/active/hand/b.md'],
        ledgerRevision: 'abc',
      },
    ]);
    expect(result.out).toEqual([
      'Committed 0123456789ab (2 files)',
      '  specs/active/hand/a.md',
      '  specs/active/hand/b.md',
      'Remaining uncommitted: 0',
    ]);
  });

  it('takes a UUID as well as a slug, and makes an operation id of its own', async () => {
    const { api, calls } = stubApi();

    expect((await run(api, ['--spec', SPEC])).exit).toBe(0);
    expect((await run(api, ['--spec', SPEC])).exit).toBe(0);

    expect(calls.commits).toHaveLength(2);
    expect(calls.commits[0]).toMatchObject({ scope: 'specification', specId: SPEC });
    expect(calls.commits[0]!.operationId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(calls.commits[0]!.operationId).not.toBe(calls.commits[1]!.operationId);
    expect(calls.commits[0]).not.toHaveProperty('message');
    expect(calls.commits[0]).not.toHaveProperty('paths');
  });

  it('commits the definitions without a Specification and everything with the scope all', async () => {
    const { api, calls } = stubApi();

    expect((await run(api, ['--scope', 'definitions'])).exit).toBe(0);
    expect((await run(api, ['--scope', 'all'])).exit).toBe(0);
    expect((await run(api, ['--scope', 'all', '--spec', 'hand'])).exit).toBe(0);

    expect(calls.commits.map(({ operationId: _id, ...rest }) => rest)).toEqual([
      { scope: 'definitions' },
      { scope: 'all' },
      { scope: 'all', specId: SPEC },
    ]);
    expect(calls.names.filter((name) => name === 'resolveSpecification')).toHaveLength(1);
  });

  it('prints one JSON document with --json', async () => {
    const { api } = stubApi();

    const result = await run(api, ['--spec', 'hand', '--json']);

    expect(result.exit).toBe(0);
    expect(result.out).toHaveLength(1);
    expect(JSON.parse(result.out[0]!)).toEqual({
      operationId: OP,
      scope: 'specification',
      specId: SPEC,
      commit: COMMITTED.commit,
      paths: COMMITTED.paths,
      remaining: COMMITTED.remaining,
      replayed: false,
    });
  });

  it('says so when there was nothing to commit and when the answer is a replay', async () => {
    const nothing = stubApi({
      commit: () =>
        Promise.resolve({
          ...COMMITTED,
          commit: { state: 'not-applicable', reason: 'nothing-to-commit' },
          paths: [],
          replayed: true,
        }),
    }).api;

    const result = await run(nothing, ['--spec', 'hand']);

    expect(result.exit).toBe(0);
    expect(result.out[0]).toBe('Nothing to commit: every path already equals HEAD.');
    expect(result.out.join('\n')).toContain('earlier request');
  });

  it.each<[ErrorCode, ErrorDetails, string]>([
    [
      'MANUAL_COMMIT_UNAVAILABLE',
      { cause: 'queue-not-empty' },
      'nevo-specflow specs documents flush',
    ],
    ['MANUAL_COMMIT_UNAVAILABLE', { cause: 'ledger-empty' }, 'commit status'],
    ['MANUAL_COMMIT_UNAVAILABLE', { cause: 'git-disabled' }, 'Git is disabled'],
    ['MANUAL_COMMIT_CONFLICT', { cause: 'content-changed', paths: ['a.md'] }, 'resolve'],
    ['MANUAL_COMMIT_CONFLICT', { cause: 'branch-changed' }, 'Switch back'],
    ['MANUAL_COMMIT_SUBSET_INVALID', { paths: ['a.md', 'b.md'] }, '--path'],
    ['MANUAL_COMMIT_SUBSET_INVALID', { cause: 'path-not-in-ledger' }, 'commit status'],
    ['MANUAL_COMMIT_STALE', undefined, 'commit status'],
    ['MANUAL_COMMIT_MESSAGE_INVALID', { cause: 'empty' }, '1-100 characters'],
    ['MANUAL_COMMIT_RECOVERY_REQUIRED', undefined, 'specs documents recover'],
    ['BRANCH_PROTECTED', { reason: 'branch-protected' }, 'branch'],
    ['SPEC_BUSY', { reason: 'busy', cause: 'commit-in-progress', retryAfterMs: 1000 }, 'Retry'],
  ])('exits 1 on %s (%j) with a hint', async (code, details, hint) => {
    const result = await run(refuse(new DocumentError(code, 'Refused.', details)), [
      '--spec',
      'hand',
    ]);

    expect(result.exit).toBe(1);
    expect(result.out).toEqual([]);
    expect(result.err[0]).toContain(code);
    expect(result.err.join('\n')).toContain(hint);
  });

  it('prints the refusal as JSON on stdout too with --json', async () => {
    const result = await run(
      refuse(new DocumentError('MANUAL_COMMIT_CONFLICT', 'Edited.', { paths: ['a.md'] })),
      ['--spec', 'hand', '--json'],
    );

    expect(result.exit).toBe(1);
    expect(JSON.parse(result.out[0]!)).toMatchObject({
      error: { code: 'MANUAL_COMMIT_CONFLICT', details: { paths: ['a.md'] } },
    });
  });

  it('exits 1 for a Specification that does not exist and commits nothing', async () => {
    const { api, calls } = stubApi();

    const result = await run(api, ['--spec', 'missing']);

    expect(result.exit).toBe(1);
    expect(result.err[0]).toContain('DOCUMENT_NOT_FOUND');
    expect(calls.commits).toEqual([]);
  });

  it('lets an error that is not a refusal reach the executable boundary', async () => {
    const api = stubApi({ commit: () => Promise.reject(new Error('boom')) }).api;

    await expect(run(api, ['--spec', 'hand'])).rejects.toThrow('boom');
  });

  it.each([
    [[]],
    [['--scope', 'specification']],
    [['--scope', 'definitions', '--spec', 'hand']],
    [['--scope', 'everything']],
    [['--spec', 'hand', '--operation-id', 'not-a-uuid']],
    [['--spec', 'hand', '--ledger-revision']],
    [['--spec', 'hand', '-m']],
    [['--spec', 'hand', 'extra']],
    [['--spec', 'hand', '--force']],
  ])('exits 2 on the usage error %j without opening the Engine', async (args) => {
    const { api, calls } = stubApi();

    const result = await run(api, args);

    expect(result.exit).toBe(2);
    expect(calls.names).toEqual([]);
  });
});

describe('commit status', () => {
  it('lists the paths, the policy, the revision and the queue', async () => {
    const { api, calls } = stubApi();

    const result = await run(api, ['status', '--spec', 'hand']);

    expect(result.exit).toBe(0);
    expect(calls.views).toEqual([{ scope: 'specification', specId: SPEC }]);
    expect(result.out).toEqual([
      'Scope: specification',
      'Commit policy: documents manual (local)',
      `Ledger revision: ${'a'.repeat(64)}`,
      'Uncommitted: 1 path(s)',
      `  specs/active/hand/a.md  auto-commit-off  2 operation(s)  [${SPEC}]`,
      'Queue: 0 pending, 0 failed, 0 need recovery',
    ]);
  });

  it('explains why a manual commit is unavailable while the queue is not at rest', async () => {
    const busy = stubApi({
      uncommitted: () =>
        Promise.resolve({ ...VIEW, queue: { pending: 1, failed: 0, recoveryRequired: 0 } }),
    }).api;

    const result = await run(busy, ['status', '--spec', 'hand']);

    expect(result.out.join('\n')).toContain('unavailable until the queue is at rest');
  });

  it('prints the view as JSON and reads the other scopes', async () => {
    const { api, calls } = stubApi();

    const json = await run(api, ['status', '--spec', 'hand', '--json']);
    expect(JSON.parse(json.out[0]!)).toEqual(VIEW);
    await run(api, ['status', '--scope', 'definitions']);
    await run(api, ['status', '--scope', 'all']);

    expect(calls.views).toEqual([
      { scope: 'specification', specId: SPEC },
      { scope: 'definitions' },
      { scope: 'all' },
    ]);
  });

  it('exits 2 without a scope and 1 on a refusal', async () => {
    const { api } = stubApi();
    expect((await run(api, ['status'])).exit).toBe(2);
    const refused = stubApi({
      uncommitted: () => Promise.reject(new DocumentError('DOCUMENT_NOT_FOUND', 'No.')),
    }).api;
    expect((await run(refused, ['status', '--spec', 'hand'])).exit).toBe(1);
  });
});
