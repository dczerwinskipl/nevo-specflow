import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createFakeEmbeddingProvider } from '@nevo/ai-semantic-search/testing';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { parseDocsConfig } from '../config/docs-settings';
import { openFileSystemCorpus } from '../corpus/corpus';
import { openDocsSearch, searchDocumentation } from '../search/search';
import { buildDocsIndex } from './build';
import { openProjectIndex } from './index-store';
import { readLatestProgress } from './progress';
import { cacheNotIgnoredReason } from './reasons';
import {
  createGitIgnoreCheck,
  createIndexWrites,
  findGitRepository,
  gitIgnoreAdmission,
  type FindGitRepository,
  type GitIgnoreAnswer,
  type GitRunOutcome,
} from './write-admission';

const root = mkdtempSync(join(tmpdir(), 'specflow-docs-admission-'));
mkdirSync(join(root, 'docs'));
const guide = (install: string) =>
  `---\nid: guide\ntype: hub\ntitle: Guide\nstatus: current\n---\n\n# Guide\n\n## Install\n\n${install}\n`;
writeFileSync(join(root, 'docs', 'guide.md'), guide('Install the widget.'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const configuration = {
  docs: parseDocsConfig({ search: { semantic: true } }),
  embeddings: { protocol: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', model: 'm' },
} as const;
const request = {
  query: 'install widget',
  limit: 5,
  includeProposals: false,
  snippets: false,
  refresh: true,
};

const INDEX = '.nevo/local/cache/docs-index';
const ignored: GitIgnoreAnswer = { status: 'ignored' };
const notIgnored: GitIgnoreAnswer = { status: 'not-ignored' };

/** The index directory's files, progress record names generalised. */
const files = (directory: string) =>
  readdirSync(directory, { recursive: true, encoding: 'utf8' })
    .map((name) => name.replaceAll('\\', '/').replace(/^progress-.*\.json$/, 'progress-*.json'))
    .sort();

/** Every file of the index directory with its content, but the writer lock `close` removes. */
const contents = (directory: string) =>
  Object.fromEntries(
    readdirSync(directory, { recursive: true, encoding: 'utf8' })
      .map((name) => name.replaceAll('\\', '/'))
      .filter((name) => !name.startsWith('vectors/writer-'))
      .flatMap((name): [string, string][] => {
        try {
          return [[name, readFileSync(join(directory, name), 'utf8')]];
        } catch {
          // A directory.
          return [];
        }
      }),
  );

describe('write admission', () => {
  it('checks before every write, also of a running refresh, and writes nothing once Git stops ignoring', async () => {
    let answer: GitIgnoreAnswer = ignored;
    const asked: string[] = [];
    const isIgnored = (_root: string, path: string) => {
      asked.push(path);

      return Promise.resolve(answer);
    };

    const corpus = openFileSystemCorpus(root, configuration.docs);
    const index = await openProjectIndex(root, corpus, configuration, isIgnored);
    const provider = createFakeEmbeddingProvider();
    const environment = { env: {}, createProvider: () => provider };
    const generation = async () => {
      const manifest = await index.store.readManifest();

      return manifest.status === 'ok' ? manifest.manifest.generation : undefined;
    };

    // Opening, the chunk cache, the writer lock, the slice and one per progress record (the plan,
    // the slice and the end).
    expect(await buildDocsIndex(index, configuration, environment)).toMatchObject({
      status: 'done',
      outcome: { status: 'refreshed' },
    });
    expect(asked).toHaveLength(7);
    expect(new Set(asked)).toEqual(new Set([`${INDEX}/`]));
    const built = await generation();
    expect(await readLatestProgress(index.directory)).toMatchObject({
      state: 'finished',
      generation: built,
    });

    // The ignore answer flips while the next refresh runs: once its lock is taken and the plan
    // reported, Git no longer ignores the index. Every write after the flip is refused: the plan's
    // progress record (queued before the flip, written after it), the slice and the end record.
    writeFileSync(join(root, 'docs', 'guide.md'), guide('Install the widget with pnpm.'));
    let atFlip: Record<string, string> | undefined;
    expect(
      await buildDocsIndex(index, configuration, environment, () => {
        if (atFlip === undefined) {
          atFlip = contents(index.directory);
          answer = notIgnored;
        }
      }),
    ).toMatchObject({
      status: 'done',
      outcome: { status: 'write-failed' },
      reason: cacheNotIgnoredReason(INDEX),
    });
    expect(atFlip).toBeDefined();
    expect(contents(index.directory)).toEqual(atFlip);
    expect(await generation()).toBe(built);
    expect(await readLatestProgress(index.directory)).toMatchObject({
      state: 'finished',
      generation: built,
    });
    const afterRefusal = files(index.directory);

    const search = openDocsSearch({
      corpus,
      configuration,
      env: {},
      createProvider: () => provider,
      index,
    });
    const embedded = provider.calls.length;
    const refused = await searchDocumentation(search, request);
    expect(refused).toMatchObject({
      mode: 'lexical',
      reason: {
        code: 'index-unavailable',
        message: expect.stringContaining('add `.nevo/local/` to the project') as unknown,
      },
    });
    expect(refused.results.map((hit) => hit.id)).toEqual(['guide']);
    expect(provider.calls.length).toBe(embedded);
    expect(files(index.directory)).toEqual(afterRefusal);

    // No answer is reused: once Git ignores the index again, the next search writes it.
    answer = ignored;
    expect((await searchDocumentation(search, request)).mode).toBe('hybrid');
    expect(await generation()).toBeGreaterThan(built!);
  });
});

describe('git ignore check', () => {
  const projectRoot = join(tmpdir(), 'some-project');
  /** A Git runner answering `sequence` in order, recording what it was asked. */
  const git = (...sequence: GitRunOutcome[]) => {
    const calls: (readonly string[])[] = [];

    return {
      calls,
      run: (args: readonly string[]) => {
        calls.push(args);

        return Promise.resolve<GitRunOutcome>(sequence.shift() ?? { status: 'not-run' });
      },
    };
  };

  const repository =
    (presence: Awaited<ReturnType<FindGitRepository>>): FindGitRepository =>
    () =>
      Promise.resolve(presence);

  it("trusts Git's own answers without looking for a repository", async () => {
    const runner = git({ status: 'exited', code: 0 }, { status: 'exited', code: 1 });
    const check = createGitIgnoreCheck(runner.run, () => {
      throw new Error('not asked');
    });
    expect(await check(projectRoot, `${INDEX}/`)).toEqual(ignored);
    expect(await check(projectRoot, `${INDEX}/`)).toEqual(notIgnored);
    expect(runner.calls[0]).toEqual(['-C', projectRoot, 'check-ignore', '-q', '--', `${INDEX}/`]);
  });

  it('fails closed on every outcome without an answer where a repository may be', async () => {
    const cases: [GitRunOutcome, string][] = [
      // For example a safe.directory refusal.
      [{ status: 'exited', code: 128 }, 'git check-ignore exited with code 128'],
      [{ status: 'timed-out' }, 'git check-ignore did not answer in time'],
      // Git missing (a spawn error).
      [{ status: 'not-run' }, 'Git could not be run'],
    ];
    for (const presence of ['present', 'unknown'] as const) {
      for (const [outcome, detail] of cases) {
        const check = createGitIgnoreCheck(git(outcome).run, repository(presence));
        expect(await check(projectRoot, `${INDEX}/`)).toEqual({ status: 'unverified', detail });
      }
    }
  });

  it('admits a directory established to be in no repository, with or without Git', async () => {
    const cases: GitRunOutcome[] = [
      { status: 'exited', code: 128 },
      { status: 'not-run' },
      { status: 'timed-out' },
    ];
    for (const outcome of cases) {
      const check = createGitIgnoreCheck(git(outcome).run, repository('absent'));
      expect(await check(projectRoot, `${INDEX}/`)).toEqual({ status: 'outside-work-tree' });
    }
  });

  it('finds a repository from a .git entry in the project root or above it', async () => {
    const top = mkdtempSync(join(tmpdir(), 'specflow-docs-repository-'));
    try {
      mkdirSync(join(top, 'project', 'nested'), { recursive: true });
      // A linked worktree or a submodule has a `.git` file.
      writeFileSync(join(top, '.git'), 'gitdir: elsewhere\n');
      expect(await findGitRepository(join(top, 'project', 'nested'))).toBe('present');
    } finally {
      rmSync(top, { recursive: true, force: true });
    }
  });

  it('finds the repository a symbolic link or junction of the project root leads into', async () => {
    const top = mkdtempSync(join(tmpdir(), 'specflow-docs-linked-'));
    try {
      const repository = join(top, 'repository');
      mkdirSync(join(repository, 'project'), { recursive: true });
      execFileSync('git', ['init', '-q', repository]);
      const outside = join(top, 'outside');
      mkdirSync(outside);
      const link = join(outside, 'project');
      symlinkSync(join(repository, 'project'), link, 'junction');

      // The given path has no `.git` above it; only the resolved one does.
      expect(await findGitRepository(outside)).toBe('absent');
      expect(await findGitRepository(link)).toBe('present');
    } finally {
      rmSync(top, { recursive: true, force: true });
    }
  });

  it('answers unknown for a project root that cannot be resolved', async () => {
    expect(await findGitRepository(join(tmpdir(), 'specflow-docs-no-such-root'))).toBe('unknown');
  });

  it('counts GIT_DIR as a repository', async () => {
    vi.stubEnv('GIT_DIR', join(tmpdir(), 'elsewhere.git'));
    try {
      expect(await findGitRepository(tmpdir())).toBe('present');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('resumes writes once Git answers that it ignores the index again', async () => {
    // A safe.directory refusal (exit 128 in a repository), then the configuration is fixed.
    const runner = git({ status: 'exited', code: 128 }, { status: 'exited', code: 0 });
    const writes = createIndexWrites(
      gitIgnoreAdmission(
        projectRoot,
        INDEX,
        createGitIgnoreCheck(runner.run, repository('present')),
      ),
    );
    expect(await writes.check()).toMatchObject({ code: 'index-unavailable' });
    expect(writes.refusal()).toMatchObject({ code: 'index-unavailable' });
    expect(await writes.blocked()).toBeUndefined();
    expect(writes.refusal()).toBeUndefined();
  });
});

describe('git ignore admission', () => {
  const projectRoot = join(tmpdir(), 'some-project');
  const admission = (answer: GitIgnoreAnswer) =>
    gitIgnoreAdmission(projectRoot, INDEX, () => Promise.resolve(answer));

  it('admits only an ignored index or a project in no repository', async () => {
    expect(await admission(ignored)()).toBeUndefined();
    expect(await admission({ status: 'outside-work-tree' })()).toBeUndefined();
    expect(await admission(notIgnored)()).toEqual(cacheNotIgnoredReason(INDEX));

    const unverified = await admission({ status: 'unverified', detail: 'Git could not be run' })();
    expect(unverified).toMatchObject({ code: 'index-unavailable' });
    expect(unverified?.message).toContain(`${INDEX}/ (Git could not be run)`);
    expect(unverified?.message).not.toContain(projectRoot);
  });
});
