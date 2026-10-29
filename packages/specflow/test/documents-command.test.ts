// Command adapters of `specs documents`, in process, against a stub of the Engine capabilities.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DocumentError, type DocumentChangeResult } from '@nevo/specflow-engine';
import { CommanderError } from 'commander';
import { afterEach, describe, expect, it } from 'vitest';

import type { DocumentsEngineApi } from '../src/documents/api';
import { ReportedFailure, commanderExitCode } from '../src/exit-code';
import { createProgram } from '../src/program';

const SPEC = '11111111-1111-4111-8111-111111111111';
const OP = '22222222-2222-4222-8222-222222222222';
const ENGINE = { tag: 'engine' } as never;

const PENDING = { state: 'pending', attempts: 0 } as const;

function resultOf(
  overrides: Partial<DocumentChangeResult> = {},
  stage: DocumentChangeResult['stage'] = 'queued',
): DocumentChangeResult {
  return {
    operationId: OP,
    specId: SPEC,
    slug: 'hand',
    action: 'create',
    documents: [{ id: 'notes', path: 'notes.md', type: 'notes', sha256: 'abc', bytes: 3 }],
    removedDocumentIds: [],
    folders: [],
    allocatedIds: ['notes'],
    commit: PENDING,
    stage,
    replayed: false,
    ...overrides,
  };
}

interface Calls {
  readonly names: string[];
  readonly writes: { specId: string; operationId: string; request: unknown }[];
}

function stubApi(overrides: Partial<DocumentsEngineApi> = {}): {
  api: DocumentsEngineApi;
  calls: Calls;
} {
  const calls: Calls = { names: [], writes: [] };
  const record =
    <A extends unknown[], R>(name: string, value: (...args: A) => R) =>
    (...args: A): R => {
      calls.names.push(name);

      return value(...args);
    };

  const api: DocumentsEngineApi = {
    openEngine: record('openEngine', () => Promise.resolve(ENGINE)),
    readTree: record('readTree', () =>
      Promise.resolve({
        revision: 'tree-1',
        archetype: { id: 'minimal', version: 1 },
        folders: [{ path: '' }],
        documents: [],
        dangling: [],
        completeness: { complete: true, requirements: [] },
        issues: [],
        truncated: false,
        skippedEntries: 0,
      } as never),
    ),
    write: record('write', (_engine, specId, operationId, request) => {
      calls.writes.push({ specId, operationId, request });

      return Promise.resolve(resultOf());
    }),
    status: record('status', () =>
      Promise.resolve({
        operationId: OP,
        specId: SPEC,
        action: 'create',
        documentIds: ['notes'],
        createdAt: 'now',
        commit: { state: 'committed', sha: '0123456789abcdef' },
        stage: 'completed',
      } as never),
    ),
    checkoutOf: record('checkoutOf', () => Promise.resolve({ workspaceId: 'w', root: '/r' })),
    catalogueRevisionFor: record('catalogueRevisionFor', () => Promise.resolve('rev-1')),
    flushCheckout: record('flushCheckout', () =>
      Promise.resolve({ remaining: undefined, timedOut: false }),
    ),
    flushAll: record('flushAll', () =>
      Promise.resolve({ checkouts: 1, remaining: 0, timedOut: false }),
    ),
    retry: record('retry', () => Promise.resolve([])),
    abandon: record('abandon', () => Promise.resolve([])),
    recover: record('recover', () => Promise.resolve([])),
    takeOver: record('takeOver', () =>
      Promise.resolve({ lock: { status: 'free' }, writes: [], manualCommits: [], passes: [] }),
    ),
    resolve: record('resolve', () => Promise.resolve({ resolved: [], stillUncommitted: [] })),
    ...overrides,
  };

  return { api, calls };
}

interface Run {
  readonly out: string[];
  readonly err: string[];
  readonly exit: number;
}

async function run(
  api: DocumentsEngineApi,
  args: string[],
  extra: { readStdin?: () => Promise<string>; cwd?: string } = {},
): Promise<Run> {
  const out: string[] = [];
  const err: string[] = [];
  const program = createProgram({
    cwd: extra.cwd ?? '.',
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
    documentsApi: api,
    ...(extra.readStdin ? { readStdin: extra.readStdin } : {}),
  });
  try {
    await program.parseAsync(['node', 'nevo-specflow', 'specs', 'documents', ...args]);

    return { out, err, exit: 0 };
  } catch (error) {
    if (error instanceof CommanderError) {
      return { out, err, exit: commanderExitCode(error) };
    }

    if (error instanceof ReportedFailure) {
      return { out, err, exit: error.exitCode };
    }

    throw error;
  }
}

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('list and validate', () => {
  it('prints the tree and, with --json, one document that carries the spec id', async () => {
    const { api } = stubApi();
    const human = await run(api, ['list', SPEC]);
    expect(human.exit).toBe(0);
    expect(human.out.join('\n')).toContain('Tree revision: tree-1');

    const json = await run(api, ['list', SPEC, '--json']);
    expect(json.out).toHaveLength(1);
    expect(JSON.parse(json.out[0]!)).toMatchObject({ specId: SPEC, revision: 'tree-1' });
  });

  it('fails validate (exit 1) when the Specification is incomplete', async () => {
    const { api } = stubApi({
      readTree: () =>
        Promise.resolve({
          revision: 't',
          archetype: { id: 'minimal', version: 1 },
          folders: [],
          documents: [],
          dangling: [],
          completeness: {
            complete: false,
            requirements: [{ documentType: 'overview', minCount: 1, count: 0, satisfied: false }],
          },
          issues: [],
          truncated: false,
          skippedEntries: 0,
        } as never),
    });
    const result = await run(api, ['validate', SPEC, '--json']);
    expect(result.exit).toBe(1);
    expect(JSON.parse(result.out[0]!)).toMatchObject({ valid: false, complete: false });
  });
});

describe('writes', () => {
  it('adds a document from stdin, generates an operation id and drains once at exit', async () => {
    const { api, calls } = stubApi();
    const result = await run(
      api,
      ['add', SPEC, '--path', 'notes.md', '--type', 'notes', '--stdin', '--json'],
      { readStdin: () => Promise.resolve('# Notes\n') },
    );
    expect(result.exit).toBe(0);
    expect(calls.writes).toHaveLength(1);
    expect(calls.writes[0]?.operationId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(calls.writes[0]?.request).toEqual({
      action: 'create',
      documents: [{ path: 'notes.md', content: '# Notes\n', type: 'notes' }],
      folders: [],
    });
    // The acknowledged state is printed; the queue is drained after, not before.
    expect(JSON.parse(result.out[0]!)).toMatchObject({
      operationId: OP,
      commit: { state: 'pending' },
    });
    expect(calls.names.filter((name) => name === 'flushAll')).toHaveLength(1);
    expect(calls.names.indexOf('flushAll')).toBeGreaterThan(calls.names.indexOf('write'));
    expect(calls.names).not.toContain('flushCheckout');
  });

  it('does not drain when the write queued nothing', async () => {
    const { api, calls } = stubApi({
      write: () => Promise.resolve(resultOf({ commit: { state: 'not-applicable' } }, 'completed')),
    });
    const result = await run(api, ['folder', SPEC, 'docs']);
    expect(result.exit).toBe(0);
    expect(calls.names).not.toContain('flushAll');
  });

  it('notes on stderr when the exit drain leaves commits queued, and still succeeds', async () => {
    const { api } = stubApi({
      flushAll: () => Promise.resolve({ checkouts: 1, remaining: 2, timedOut: true }),
    });
    const result = await run(api, ['folder', SPEC, 'docs']);
    expect(result.exit).toBe(0);
    expect(result.err.join('\n')).toContain('2 document commit(s) are still queued');
  });

  it('adds a document from a template with the current catalogue revision', async () => {
    const { api, calls } = stubApi();
    const result = await run(api, ['add', SPEC, '--template', 'decisions', '--path', 'd.md']);
    expect(result.exit).toBe(0);
    expect(calls.writes[0]?.request).toEqual({
      action: 'create',
      documents: [{ templateId: 'decisions', path: 'd.md' }],
      folders: [],
      catalogueRevision: 'rev-1',
    });
  });

  it('reads a file given with --content-file relative to the working directory', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'specflow-docs-cmd-'));
    dirs.push(cwd);
    await writeFile(join(cwd, 'body.md'), 'from a file\n');
    const { api, calls } = stubApi();
    const result = await run(
      api,
      ['save', SPEC, 'notes', '--expected-revision', 'r1', '--content-file', 'body.md'],
      { cwd },
    );
    expect(result.exit).toBe(0);
    expect(calls.writes[0]?.request).toEqual({
      action: 'save',
      documentId: 'notes',
      content: 'from a file\n',
      expectedRevision: 'r1',
    });
  });

  it('uses the given --operation-id', async () => {
    const { api, calls } = stubApi();
    await run(api, ['folder', SPEC, 'docs', '--operation-id', OP]);
    expect(calls.writes[0]?.operationId).toBe(OP);
  });

  it.each([
    [
      ['rename', SPEC, 'new.md', '--document', 'notes', '--expected-revision', 'r'],
      { action: 'rename', target: { kind: 'document', documentId: 'notes' }, name: 'new.md' },
    ],
    [
      ['move', SPEC, '--folder', 'a', '--to-root', '--expected-revision', 'r'],
      { action: 'move', target: { kind: 'folder', path: 'a' }, targetFolder: '' },
    ],
    [
      ['move', SPEC, '--document', 'notes', '--to', 'deep/er', '--expected-revision', 'r'],
      {
        action: 'move',
        target: { kind: 'document', documentId: 'notes' },
        targetFolder: 'deep/er',
      },
    ],
    [
      ['delete', SPEC, '--document', 'notes', '--expected-revision', 'r'],
      { action: 'delete', target: { kind: 'document', documentId: 'notes' } },
    ],
    [
      ['classify', SPEC, 'loose', '--type', 'notes', '--expected-revision', 'r'],
      { action: 'classify', documentId: 'loose', type: 'notes' },
    ],
  ])('maps %j to one Engine request', async (args, expected) => {
    const { api, calls } = stubApi();
    expect((await run(api, args)).exit).toBe(0);
    expect(calls.writes[0]?.request).toMatchObject({ ...expected, expectedRevision: 'r' });
  });

  it('waits only with --wait and reports the settled commit', async () => {
    const { api, calls } = stubApi();
    const result = await run(api, ['folder', SPEC, 'docs', '--wait', '--json']);
    expect(result.exit).toBe(0);
    expect(calls.names).toContain('flushCheckout');
    expect(JSON.parse(result.out[0]!)).toMatchObject({ commit: { state: 'committed' } });
  });

  it('exits 1 when --wait ends with a commit that failed', async () => {
    const { api } = stubApi({
      status: () =>
        Promise.resolve({ commit: { state: 'failed', reason: 'commit-failed' } } as never),
    });
    const result = await run(api, ['folder', SPEC, 'docs', '--wait']);
    expect(result.exit).toBe(1);
    expect(result.err.join('\n')).toContain('did not settle');
  });
});

describe('refusals', () => {
  const refuse = (error: DocumentError) => stubApi({ write: () => Promise.reject(error) }).api;

  it('prints code, cause and hint on stderr, nothing on stdout, and exits 1', async () => {
    const api = refuse(
      new DocumentError('SPEC_BUSY', 'Busy.', {
        reason: 'busy',
        cause: 'queue-full',
        retryAfterMs: 1500,
      }),
    );
    const result = await run(api, ['folder', SPEC, 'docs']);
    expect(result.exit).toBe(1);
    expect(result.out).toEqual([]);
    expect(result.err.join('\n')).toContain('SPEC_BUSY: Busy. (queue-full)');
    expect(result.err.join('\n')).toContain('Retry in 1500 ms');
  });

  it('prints a JSON error object on stdout with --json', async () => {
    const api = refuse(new DocumentError('DOCUMENT_COMMITS_PENDING', 'Pending.'));
    const result = await run(api, ['folder', SPEC, 'docs', '--json']);
    expect(result.exit).toBe(1);
    expect(JSON.parse(result.out[0]!)).toMatchObject({
      error: { code: 'DOCUMENT_COMMITS_PENDING', hint: expect.stringContaining('flush') as string },
    });
  });

  it('tells uncommitted changes apart from unfinished commits', async () => {
    const api = refuse(
      new DocumentError('DOCUMENT_COMMITS_PENDING', 'Pending.', { cause: 'commit-uncommitted' }),
    );
    const result = await run(api, ['folder', SPEC, 'docs']);
    expect(result.err.join('\n')).toContain('nevo-specflow commit --spec');
    expect(result.err.join('\n')).not.toContain('retry or abandon');
    const limit = await run(refuse(new DocumentError('DOCUMENT_UNCOMMITTED_LIMIT', 'Full.')), [
      'folder',
      SPEC,
      'docs',
    ]);
    expect(limit.err.join('\n')).toContain('Commit the uncommitted changes first');
  });

  it('prints the commit policy when auto-commit is off', async () => {
    const tree = {
      revision: 'tree-1',
      archetype: { id: 'minimal', version: 1 },
      folders: [{ path: '' }],
      documents: [],
      dangling: [],
      completeness: { complete: true, requirements: [] },
      issues: [],
      truncated: false,
      skippedEntries: 0,
      commits: { pending: 0, failed: 0, recoveryRequired: 0, uncommitted: 2, policy: 'manual' },
    };
    const manual = stubApi({ readTree: () => Promise.resolve(tree as never) }).api;
    const out = (await run(manual, ['list', SPEC])).out.join('\n');
    expect(out).toContain('2 uncommitted');
    expect(out).toContain('Commit policy: manual');
    expect((await run(stubApi().api, ['list', SPEC])).out.join('\n')).not.toContain('policy');
  });

  it('points at the recover command for a batch that needs recovery', async () => {
    const api = refuse(
      new DocumentError('DOCUMENT_RECOVERY_REQUIRED', 'Recover.', { cause: 'write-ambiguous' }),
    );
    const result = await run(api, ['folder', SPEC, 'docs']);
    expect(result.err.join('\n')).toContain('specs documents recover');
  });

  it('lets an error that is not a refusal reach the executable boundary', async () => {
    const api = stubApi({ write: () => Promise.reject(new Error('disk gone')) }).api;
    await expect(run(api, ['folder', SPEC, 'docs'])).rejects.toThrow('disk gone');
  });
});

describe('queue commands', () => {
  it('flush of a Specification exits 0 when settled and 1 when a hold remains', async () => {
    expect((await run(stubApi().api, ['flush', SPEC])).exit).toBe(0);
    const held = stubApi({
      flushCheckout: () =>
        Promise.resolve({
          remaining: { workspaceId: 'w', cause: 'commit-failed', operationIds: [OP] },
          timedOut: false,
        }),
    });
    expect((await run(held.api, ['flush', SPEC])).exit).toBe(1);
  });

  it('flush without a Specification drains every checkout', async () => {
    const { api, calls } = stubApi();
    expect((await run(api, ['flush'])).exit).toBe(0);
    expect(calls.names).toContain('flushAll');
  });

  it('retry and abandon print the status afterwards', async () => {
    const { api, calls } = stubApi();
    const retried = await run(api, ['retry', OP]);
    expect(retried.exit).toBe(0);
    expect(retried.out.join('\n')).toContain(`Operation: ${OP}`);
    expect(calls.names).toEqual(expect.arrayContaining(['retry', 'status', 'flushAll']));
    const abandoned = stubApi();
    await run(abandoned.api, ['abandon', OP]);
    expect(abandoned.calls.names).toContain('abandon');
    expect(abandoned.calls.names).not.toContain('flushAll');
  });

  it('recover resolves one operation with exactly one mode', async () => {
    const seen: unknown[][] = [];
    const { api } = stubApi({
      recover: (...args) => {
        seen.push(args.slice(1));

        return Promise.resolve([]);
      },
    });
    expect((await run(api, ['recover', OP, '--adopt', '--confirmed-stopped'])).exit).toBe(0);
    expect(seen).toEqual([[OP, 'adopt', true]]);
    expect((await run(api, ['recover', OP, '--abandon'])).exit).toBe(0);
    expect(seen[1]).toEqual([OP, 'abandon', false]);
  });

  it('recover without an operation id is the queue-wide takeover and needs --confirmed-stopped', async () => {
    const { api, calls } = stubApi();
    expect((await run(api, ['recover', '--confirmed-stopped'])).exit).toBe(0);
    expect(calls.names).toContain('takeOver');
    const refused = stubApi({
      takeOver: () =>
        Promise.resolve({
          lock: { status: 'refused', reason: 'holder-alive' },
          writes: [],
          manualCommits: [],
          passes: [],
        } as never),
    });
    const result = await run(refused.api, ['recover', '--confirmed-stopped']);
    expect(result.exit).toBe(1);
    expect(result.err.join('\n')).toContain('Takeover refused: holder-alive');
  });
});

describe('resolve', () => {
  it('prints what left the list and what is still uncommitted, and exits 1 when nothing could go', async () => {
    const mixed = stubApi({
      resolve: () => Promise.resolve({ resolved: ['a.md'], stillUncommitted: ['b.md'] }),
    });
    const partial = await run(mixed.api, ['resolve', OP]);
    expect(partial.exit).toBe(0);
    expect(partial.out).toEqual(['Resolved: a.md', 'Still uncommitted: b.md']);
    expect(partial.err.join('\n')).toContain('nevo-specflow commit');

    const none = stubApi({
      resolve: () => Promise.resolve({ resolved: [], stillUncommitted: ['b.md'] }),
    });
    expect((await run(none.api, ['resolve', OP, '--json'])).exit).toBe(1);

    const done = stubApi({
      resolve: () => Promise.resolve({ resolved: ['a.md'], stillUncommitted: [] }),
    });
    const json = await run(done.api, ['resolve', OP, '--json']);
    expect(json.exit).toBe(0);
    expect(JSON.parse(json.out[0]!)).toEqual({
      operationId: OP,
      resolved: ['a.md'],
      stillUncommitted: [],
    });
  });
});

describe('usage errors exit 2', () => {
  it.each([
    [['add', SPEC, '--stdin']],
    [['add', SPEC, '--path', 'a.md']],
    [['add', SPEC, '--path', 'a.md', '--stdin', '--content-file', 'x']],
    [['add', SPEC, '--path', 'a.md', '--stdin', '--catalogue-revision', 'r']],
    [['save', SPEC, 'notes', '--content-file', 'x']],
    [['save', SPEC, 'notes', '--expected-revision', 'r']],
    [['rename', SPEC, 'n', '--expected-revision', 'r']],
    [['rename', SPEC, 'n', '--document', 'a', '--folder', 'b', '--expected-revision', 'r']],
    [['move', SPEC, '--document', 'a', '--expected-revision', 'r']],
    [['move', SPEC, '--document', 'a', '--to', 'x', '--to-root', '--expected-revision', 'r']],
    [['folder', SPEC, 'x', '--operation-id', 'not-a-uuid']],
    [['folder', SPEC, 'x', '--wait-ms', '0']],
    [['recover']],
    [['recover', OP]],
    [['recover', OP, '--resume', '--adopt']],
    [['recover', '--resume', '--confirmed-stopped']],
    [['resolve']],
    [['nope']],
  ])('%j', async (args) => {
    const { api, calls } = stubApi();
    expect((await run(api, args)).exit).toBe(2);
    expect(calls.writes).toEqual([]);
  });
});
