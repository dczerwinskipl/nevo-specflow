import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { sha256Hex } from '../../src/hash';
import { listUncleanPaths } from '../../src/specs/lifecycle/preflight';
import {
  assertBaselineUnchanged,
  assertCleanBaseline,
  assertFinishAttribution,
  type AttributionFacts,
} from '../../src/workflow/agent/boundary/attribution';
import {
  attributionFactsOf,
  type AttributionLayout,
  type EngineWrites,
} from '../../src/workflow/agent/boundary/facts';
import type { AgentDirtySet } from '../../src/workflow/agent/journal/model';
import { commitStaged, createGitTestProject, git } from '../support/git-project';
import { writeSpecificationManifestFixture } from '../support/manifest-fixture';

// One small committed checkout for the file; each test starts from it again.
const LAYOUT: AttributionLayout = { specificationRoot: 'specs', namespaces: ['.nevo'] };
const SPEC = 'specs/active/demo';
const TASK = `${SPEC}/tasks/t-01/task.md`;
const NONE: EngineWrites = { postImages: new Map(), complete: true };
let root: string;

async function put(path: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}

/** The Engine wrote these paths uncommitted, leaving `content` (the ledger's post-images). */
function engineWrote(entries: Record<string, string>): EngineWrites {
  return {
    postImages: new Map(
      Object.entries(entries).map(([path, content]) => [path, [sha256Hex(content)]]),
    ),
    complete: true,
  };
}

async function facts(writes: EngineWrites = NONE): Promise<AttributionFacts> {
  return attributionFactsOf(root, await listUncleanPaths(root), LAYOUT, writes);
}

function recorded(from: AttributionFacts): AgentDirtySet {
  return {
    invocationId: '3b2e8c74-8c65-4e77-9f5a-3d9c7f4bae03',
    recordedAt: '2026-11-21T10:00:00.000Z',
    paths: from.paths.map(({ path, sha256 }) => ({ path, sha256 })),
  };
}

beforeAll(async () => {
  root = await createGitTestProject('specflow-agent-boundary-', 'git:\n  enabled: true\n');
  await writeFile(join(root, '.gitignore'), '.nevo/local/\n*.log\n');
  await writeSpecificationManifestFixture(root, { slug: 'demo' });
  await put(`${SPEC}/overview.md`, '# Demo\n');
  await put(TASK, '# Task\n');
  await put('src/a.ts', 'export const a = 1;\n');
  git(root, 'add', '-A');
  commitStaged(root, 'fixture');
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

beforeEach(() => {
  git(root, 'reset', '-q', '--hard');
  git(root, 'clean', '-qfd');
});

describe('agent attempt attribution on a Git checkout', () => {
  it("accepts a finish whose changes are declared or the Engine's own; ignored files never count", async () => {
    await put('src/a.ts', 'export const a = 2;\n');
    await put('src/b.ts', 'export const b = 1;\n');
    await put(`${SPEC}/overview.md`, '# Demo, saved\n');
    await put('build.log', 'ignored\n');
    const now = await facts(engineWrote({ [`${SPEC}/overview.md`]: '# Demo, saved\n' }));

    expect(now.paths.map((fact) => fact.path)).toEqual([
      `${SPEC}/overview.md`,
      'src/a.ts',
      'src/b.ts',
    ]);
    expect(() => assertFinishAttribution(now, ['src/a.ts', 'src/b.ts'])).not.toThrow();
  });

  it('refuses a changed file the proposal does not declare', async () => {
    await put('src/a.ts', 'export const a = 2;\n');

    await expect(facts().then((now) => assertFinishAttribution(now, []))).rejects.toMatchObject({
      code: 'WORKFLOW_UNDECLARED_CHANGES',
      attribution: { undeclared: ['src/a.ts'], unchanged: [], paths: ['src/a.ts'], count: 1 },
    });
  });

  it('refuses a declared file that is not changed', async () => {
    await expect(
      facts().then((now) => assertFinishAttribution(now, ['src/a.ts'])),
    ).rejects.toMatchObject({
      code: 'WORKFLOW_UNDECLARED_CHANGES',
      attribution: { undeclared: [], unchanged: ['src/a.ts'] },
    });
  });

  it('refuses a new file of the Specification without a document type, naming both remedies', async () => {
    await put(`${SPEC}/draft.md`, 'draft\n');

    await expect(facts().then((now) => assertFinishAttribution(now, []))).rejects.toMatchObject({
      code: 'WORKFLOW_UNREGISTERED_DOCUMENTS',
      attribution: { paths: [`${SPEC}/draft.md`], remedies: ['classify', 'delete'] },
    });
  });

  it('refuses a task.md edited past the post-image the Engine left', async () => {
    await put(TASK, '# Task, edited by hand\n');
    const now = await facts(engineWrote({ [TASK]: '# Task, saved by the Engine\n' }));

    expect(() => assertFinishAttribution(now, [])).toThrow(
      expect.objectContaining({
        code: 'WORKFLOW_ENGINE_FILE_EDITED',
        attribution: { paths: [TASK], count: 1 },
      }) as Error,
    );
  });

  it('refuses Continue after a file changed between Turns, not after one committed by hand', async () => {
    await put('src/a.ts', 'export const a = 2;\n');
    await put('src/d.ts', 'export const d = 1;\n');
    const atSettle = recorded(await facts());
    expect(() => assertBaselineUnchanged({ paths: [], incomplete: false }, atSettle)).not.toThrow();
    // Between the Turns: the owner commits src/d.ts, edits src/a.ts and adds src/c.ts.
    git(root, 'add', 'src/d.ts');
    commitStaged(root, 'by hand');
    await put('src/a.ts', 'export const a = 3;\n');
    await put('src/c.ts', 'export const c = 1;\n');

    await expect(
      facts().then((now) => assertBaselineUnchanged(now, atSettle)),
    ).rejects.toMatchObject({
      code: 'WORKFLOW_BASELINE_CHANGED',
      attribution: { paths: ['src/a.ts', 'src/c.ts'], count: 2 },
    });
  });

  it('refuses a start while the checkout has changes the Engine cannot attribute', async () => {
    await put(`${SPEC}/overview.md`, '# Demo, saved\n');
    await put('build.log', 'ignored\n');
    const engineOnly = await facts(engineWrote({ [`${SPEC}/overview.md`]: '# Demo, saved\n' }));
    expect(() => assertCleanBaseline(engineOnly)).not.toThrow();
    await put('notes.txt', 'mine\n');

    await expect(
      facts(engineWrote({ [`${SPEC}/overview.md`]: '# Demo, saved\n' })).then(assertCleanBaseline),
    ).rejects.toMatchObject({
      code: 'WORKFLOW_DIRTY_BASELINE',
      attribution: { paths: ['notes.txt'], count: 1 },
    });
  });

  it('fails closed when the recorded dirty set was cut, is missing, or the Engine writes are unreadable', async () => {
    await put('src/a.ts', 'export const a = 2;\n');
    const now = await facts();
    const cut = { ...recorded(now), truncated: true as const };

    for (const record of [cut, undefined]) {
      expect(() => assertBaselineUnchanged(now, record)).toThrow(
        expect.objectContaining({
          code: 'WORKFLOW_BASELINE_CHANGED',
          attribution: { paths: [], count: 0, incomplete: true },
        }) as Error,
      );
    }

    const unreadable = await facts({ postImages: new Map(), complete: false });
    expect(() => assertFinishAttribution(unreadable, ['src/a.ts'])).toThrow(
      expect.objectContaining({
        code: 'WORKFLOW_UNDECLARED_CHANGES',
        attribution: { paths: [], count: 0, incomplete: true },
      }) as Error,
    );
  });
});
