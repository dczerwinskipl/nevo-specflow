// The real project, real Git and real agent attempts the attempt-commit boundary suites (D15) run
// on: each case copies one initialised template Project Home (Git on, definitions installed, a
// committed `src/app.ts`, a committed Specification that never started and a one-step workflow whose
// only step an agent may finish), so no case depends on another, and runs real attempts (start, the
// Turn's writes under its claim, proposal, finalize) on Specifications of its own.
import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, expect } from 'vitest';

import { sha256Hex } from '../../src/hash';
import {
  admitWorkspaceExecution,
  applyDocumentChange,
  bootstrapProjectHome,
  createSpecificationForTesting,
  finalizeAgentAttempt,
  finishStep,
  installProjectDefinitions,
  markWorkspaceExecutionDispatched,
  openAgentAttempts,
  openSpecFlowEngine,
  openWorkflow,
  proposeAgentFinish,
  readSpecificationDocumentTree,
  retryAgentAttemptCommit,
  startAgentAttempt,
  startSpecificationExecution,
  type AgentActor,
  type AgentAttemptDependencies,
  type FinalizeBoundary,
  type FinishStepInput,
  type SpecFlowEngine,
  type WorkspaceExecutionIntent,
} from '../../src/testing';
import { readLedgerRecord } from '../../src/specs/durable';
import { setLocalAutoCommit } from './document-writes';
import { commitStaged, createGitTestProject, git } from './git-project';

export const owner = {
  class: 'human',
  details: { actorId: 'local:owner', trust: 'local' },
} as const;

/**
 * The designated project every case copies: Git on, definitions installed (and the one-step
 * workflow, {@link ONE_STEP}), `src/app.ts` and a committed Specification that never started
 * (`siblingSpecId`, which a Close may archive).
 */
let template: string;
export let siblingSpecId: string;
/** The case's own checkout (the project's primary one, or the case's linked worktree). */
export let root: string;
export let engine: SpecFlowEngine;
/** Directories the case created, removed after it. */
export const cleanup: string[] = [];

/** Automatic document commits of the case's project, set explicitly (workstation-local config). */
export const autoCommitDocuments = (documents: boolean) => setLocalAutoCommit({ root }, documents);

export async function put(path: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}

export const dirty = () =>
  git(root, 'status', '--porcelain', '--untracked-files=all')
    .split('\n')
    .filter(Boolean)
    // `git` trims its output: the first line may have lost the blank of its status.
    .map((line) => line.trimStart().replace(/^\S+\s+/u, ''))
    .sort();

export const filesOf = (sha: string) =>
  git(root, 'show', '--name-only', '--format=', sha).split('\n').filter(Boolean).sort();

export const attemptCommits = (attemptId: string) =>
  git(root, 'log', '--format=%H', `--grep=Nevo-Attempt: ${attemptId}`).split('\n').filter(Boolean);

export const commitsSince = (head: string) =>
  git(root, 'rev-list', `${head}..HEAD`).split('\n').filter(Boolean);

export const subjectOf = (sha: string) => git(root, 'log', '-1', '--format=%s', sha);

export async function newSpecification(title: string, archetype = 'feature') {
  const spec = await createSpecificationForTesting(engine, {
    operationId: randomUUID(),
    title,
    created: '2026-11-23',
    archetype: { id: archetype, version: 1 },
    target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
  });

  return {
    specId: spec.specId,
    archetype,
    directory: 'specs/active/' + spec.slug,
    subject: { kind: 'specification', specId: spec.specId } as const,
  };
}

export type Spec = Awaited<ReturnType<typeof newSpecification>>;

/** The owner starts and finishes the Specification's next step. */
export async function ownerStep(spec: Spec, input: FinishStepInput['input'] = {}) {
  const workflow = await openWorkflow(engine);
  const started = await startSpecificationExecution(workflow, {
    specId: spec.specId,
    archetype: spec.archetype,
    actor: owner,
  });
  if (started.kind === 'terminal') {
    throw new Error('Nothing to start.');
  }

  return finishStep(workflow, {
    subject: spec.subject,
    step: started.context.step.id,
    attempt: started.context.attempt,
    input,
    actor: owner,
  });
}

export interface AgentTurnOptions {
  readonly step: string;
  readonly archetype: string;
  /** The Turn's own writes, under its claim (the broker's identity). */
  readonly work: (owned: {
    readonly ownedExecution: { readonly operationId: string };
  }) => Promise<void>;
  readonly input?: FinishStepInput['input'];
  readonly declared?: readonly string[];
  readonly faults?: (boundary: FinalizeBoundary) => void | Promise<void>;
  /** The Turn ends without a proposal (`false`); it proposes by default. */
  readonly propose?: false;
  /** The attempt the Turn works on (the step's first by default). */
  readonly attempt?: number;
  /** The checkout the Turn runs in (the Engine's own by default). */
  readonly workspaceId?: string;
}

/** One agent attempt of one Turn on the Specification's ready step, up to its finalize. */
export async function agentAttempt(spec: Spec, options: AgentTurnOptions) {
  const agent = await openAgentAttempts(engine);
  const actor: AgentActor = {
    class: 'agent',
    details: { archetype: options.archetype, provider: 'claude', sessionId: 'session-a' },
  };
  const invocationId = randomUUID();
  const workspaceId = options.workspaceId ?? engine.workspace.workspaceId;
  const { binding } = await startAgentAttempt(agent, {
    subject: spec.subject,
    archetype: spec.archetype,
    actor,
    expected: { step: options.step },
    workspaceId,
    turn: { invocationId, turnId: 'turn-1' },
  });
  const intent: WorkspaceExecutionIntent = {
    operationId: invocationId,
    ownerId: 'session-a',
    binding: 'a'.repeat(64),
    attempt: { attemptId: binding.attemptId },
  };
  const target = { workspaceId, specId: spec.specId };
  await admitWorkspaceExecution(engine, intent, target);
  await markWorkspaceExecutionDispatched(engine, intent, target);
  await options.work({ ownedExecution: { operationId: invocationId } });
  if (options.propose !== false) {
    await proposeAgentFinish(agent, {
      turn: {
        attemptId: binding.attemptId,
        invocationId,
        actor,
        subject: spec.subject,
        step: options.step,
        attempt: options.attempt ?? 1,
      },
      input: options.input ?? {},
      ...(options.declared ? { changes: { paths: [...options.declared] } } : {}),
    });
  }

  const receipt = { invocationId, process: 'stopped' as const, outcome: 'completed' as const };
  const finalize = (dependencies: AgentAttemptDependencies) =>
    finalizeAgentAttempt(dependencies, { attemptId: binding.attemptId, intent, receipt });
  const faulty: AgentAttemptDependencies = options.faults
    ? { ...agent, finalize: { ...agent.finalize, faults: options.faults } }
    : agent;

  return { agent, attemptId: binding.attemptId, finalize, faulty };
}

/** The Turn's save of a document of the Specification through the document writer. */
export async function saveDocument(
  spec: Spec,
  documentId: string,
  path: string,
  content: string,
  owned: { readonly ownedExecution: { readonly operationId: string } },
) {
  const current = await readFile(join(root, path), 'utf8');
  await applyDocumentChange(
    engine,
    spec.specId,
    randomUUID(),
    { action: 'save', documentId, content, expectedRevision: sha256Hex(current) },
    owned,
  );
}

/** The owner's steps up to the breakdown review, the breakdown drafting two Tasks. */
export async function toBreakdownReview(spec: Spec): Promise<void> {
  for (let step = 0; step < 3; step += 1) {
    await ownerStep(spec);
  }

  await ownerStep(spec, {
    tasks: [
      { id: 'api', title: 'API', type: 'implementation' },
      { id: 'screen', title: 'Screen', type: 'ui-implementation', dependsOn: ['api'] },
    ],
  });
}

/** The tree's document at `path` (Specification-relative). */
export async function treeDocument(spec: Spec, path: string) {
  const tree = await readSpecificationDocumentTree(engine, spec.specId);
  const document = tree.documents.find((entry) => entry.path === path);
  if (!document) {
    throw new Error(`No document at ${path}.`);
  }

  return { tree, document };
}

/** The owner's save of the document at `path` (no execution: the owner's write). */
export async function ownerSave(spec: Spec, path: string, content: string) {
  const { document } = await treeDocument(spec, path);

  return applyDocumentChange(engine, spec.specId, randomUUID(), {
    action: 'save',
    documentId: document.id,
    content,
    expectedRevision: document.revision,
  });
}

/**
 * An agent attempt of the requirements step whose commit failed (an outside edit of its declared
 * file before the commit ran): it saved the overview, created `notes.md` and changed `src/app.ts`.
 */
export async function failedAttemptWithDocuments(
  spec: Spec,
  agentContent: string,
  options: { readonly workspaceId?: string } = {},
) {
  const overview = `${spec.directory}/overview.md`;
  const attempt = await agentAttempt(spec, {
    step: 'requirements',
    archetype: 'spec-writer',
    declared: ['src/app.ts'],
    ...(options.workspaceId !== undefined ? { workspaceId: options.workspaceId } : {}),
    work: async (owned) => {
      await saveDocument(spec, 'overview', overview, '# Requirements by the agent\n', owned);
      await applyDocumentChange(
        engine,
        spec.specId,
        randomUUID(),
        {
          action: 'create',
          documents: [{ path: 'notes.md', content: 'Notes by the agent.\n' }],
          folders: [],
        },
        owned,
      );
      await put('src/app.ts', agentContent);
    },
    faults: async (boundary) => {
      if (boundary === 'post-actions-pending') {
        await put('src/app.ts', 'export const app = "outside";\n');
      }
    },
  });
  expect(await attempt.finalize(attempt.faulty)).toMatchObject({
    kind: 'finished',
    postActions: [{ action: 'attempt-commit', status: 'failed', code: 'MANUAL_COMMIT_CONFLICT' }],
  });

  return attempt;
}

/** Pins Close's integration target to the case's branch (`feature/work`), committed. */
export async function pinIntegrationTarget(): Promise<void> {
  await writeFile(
    join(root, '.nevo', 'config.yaml'),
    'runtime: {}\ngit:\n  enabled: true\n  integrationTargetBranch: feature/work\n',
  );
  git(root, 'add', '.nevo/config.yaml');
  commitStaged(root, 'pin the integration target');
}

export const agentPaths = (spec: Spec) => [
  'src/app.ts',
  `${spec.directory}/overview.md`,
  `${spec.directory}/notes.md`,
];

/** The owner's Retry commit of the attempt (the agent's content of its declared file again). */
export async function retryCommit(
  attempt: Awaited<ReturnType<typeof agentAttempt>>,
  spec: Spec,
  agentContent: string,
): Promise<void> {
  await put('src/app.ts', agentContent);
  const [retried] = (
    await retryAgentAttemptCommit(attempt.agent, {
      subject: spec.subject,
      step: 'requirements',
      attempt: 1,
      actor: owner,
    })
  ).postActions;
  expect(retried).toMatchObject({ action: 'attempt-commit', status: 'completed' });
}

/** Every owner write to a document the failed attempt commit holds is refused, nothing written. */
export async function ownerWritesOfHeldDocumentsRefused(spec: Spec, attemptId: string) {
  const ledger = () =>
    readLedgerRecord(engine.context, engine.workspace.workspaceId, {
      kind: 'specification',
      id: spec.specId,
    });
  const files = async () => ({
    overview: await readFile(join(root, spec.directory, 'overview.md'), 'utf8'),
    notes: await readFile(join(root, spec.directory, 'notes.md'), 'utf8'),
  });
  const before = { dirty: dirty(), files: await files(), ledger: await ledger() };
  const head = git(root, 'rev-parse', 'HEAD');
  const held = { code: 'DOCUMENT_COMMITS_PENDING', details: { cause: 'attempt-commit' } };

  // The tree says it before the click: the held documents cannot change, the others can.
  const { tree, document } = await treeDocument(spec, 'overview.md');
  expect(tree.attemptCommit).toMatchObject({
    attemptId,
    reason: 'attempt-commit-failed',
    code: 'MANUAL_COMMIT_CONFLICT',
    step: 'requirements',
    attempt: 1,
    paths: expect.arrayContaining(['overview.md', 'notes.md']) as string[],
  });
  expect(document.actions.save).toEqual({ available: false, reason: 'attempt-commit' });

  await expect(ownerSave(spec, 'overview.md', '# The owner’s edit\n')).rejects.toMatchObject({
    ...held,
    message: expect.stringContaining('requirements#1') as string,
  });
  const notes = (await treeDocument(spec, 'notes.md')).document;
  await expect(
    applyDocumentChange(engine, spec.specId, randomUUID(), {
      action: 'rename',
      target: { kind: 'document', documentId: notes.id },
      name: 'renamed.md',
      expectedRevision: notes.revision,
    }),
  ).rejects.toMatchObject(held);
  await expect(
    applyDocumentChange(engine, spec.specId, randomUUID(), {
      action: 'delete',
      target: { kind: 'document', documentId: notes.id },
      expectedRevision: notes.revision,
    }),
  ).rejects.toMatchObject(held);
  // Nothing was written, recorded or committed for the refused writes.
  expect({ dirty: dirty(), files: await files(), ledger: await ledger() }).toEqual(before);
  expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
}

/** A Specification archetype whose workflow has one step an agent may finish: it ends the run. */
export const ONE_STEP = 'one-step';

async function writeOneStepDefinitions(project: string): Promise<void> {
  const definitions = join(project, '.nevo', 'definitions');
  await writeFile(
    join(definitions, 'workflow', `${ONE_STEP}.yaml`),
    [
      'kind: workflow',
      'schemaVersion: 1',
      `id: ${ONE_STEP}`,
      'version: 1',
      'title: One step',
      'description: One step that ends the Specification.',
      'subject: specification',
      'entryStep: write',
      'steps:',
      '  - id: write',
      '    kind: work',
      '    title: Write it',
      '    executors: [agent, human]',
      '    archetype: spec-writer',
      '    purpose: The whole work in one step.',
      '    transitions:',
      '      - id: done',
      '        label: Done',
      '        to: { terminal: completed }',
      '',
    ].join('\n'),
  );
  await writeFile(
    join(definitions, 'specification-archetype', `${ONE_STEP}.yaml`),
    [
      'kind: specification-archetype',
      'schemaVersion: 1',
      `id: ${ONE_STEP}`,
      'version: 1',
      'title: One step',
      'description: One overview, written in one step.',
      'useWhen: The work is done in one step.',
      'instructions: Write the overview.',
      'requirements:',
      '  - documentType: overview',
      '    minCount: 1',
      'templates:',
      '  - id: overview',
      '    documentType: overview',
      '    filename: overview.md',
      '    include: always',
      '    instructions: Write it.',
      '    content: |',
      '      # Overview',
      'execution:',
      `  workflow: ${ONE_STEP}`,
      '',
    ].join('\n'),
  );
}

/** From here on the case's checkout is `path` (a linked worktree of the case's project). */
export function useCheckout(path: string): void {
  root = path;
}

/**
 * The template's Project Home moved to `root`: its local state names the template's checkout by
 * path (the marker's home root and Git directory, the registry's roots), so those paths are
 * rewritten; the identities (project, Git instance, workspaces) stay, one copy per case.
 */
async function moveProjectHome(): Promise<void> {
  const spellings = (path: string) => [
    JSON.stringify(path).slice(1, -1),
    path.replaceAll('\\', '/'),
  ];
  const [from, to] = [spellings(template), spellings(root)];
  const local = join(root, '.nevo', 'local');
  for (const entry of await readdir(local, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }

    const path = join(entry.parentPath, entry.name);
    let text = await readFile(path, 'utf8');
    from.forEach((spelling, index) => (text = text.replaceAll(spelling, to[index]!)));
    if (text.includes(basename(template))) {
      throw new Error(`The template's path is left in ${path}.`);
    }

    await writeFile(path, text);
  }
}

/**
 * Registers the template (built once per file, `prefix` names its directories) and the per-case
 * copy: `root` and `engine` are the case's own afterwards.
 */
export function useAttemptProject(prefix: string): void {
  beforeAll(async () => {
    template = await createGitTestProject(prefix, 'runtime: {}\ngit:\n  enabled: true\n');
    git(template, 'checkout', '-q', '-b', 'feature/work');
    const designated = await bootstrapProjectHome(template);
    await installProjectDefinitions(designated);
    await writeOneStepDefinitions(template);
    await mkdir(join(template, 'src'), { recursive: true });
    await writeFile(join(template, 'src', 'app.ts'), 'export const app = 1;\n');
    siblingSpecId = (
      await createSpecificationForTesting(designated, {
        operationId: randomUUID(),
        title: 'Sibling',
        created: '2026-11-23',
        archetype: { id: 'minimal', version: 1 },
        target: { kind: 'existing', workspaceId: designated.workspace.workspaceId },
      })
    ).specId;
    git(template, 'add', '-A');
    commitStaged(template, 'fixture');
  }, 600_000);

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), prefix + 'case-')));
    cleanup.push(root);
    await cp(template, root, { recursive: true });
    await moveProjectHome();
    engine = await openSpecFlowEngine({ cwd: root });
  }, 600_000);

  afterEach(async () => {
    for (const directory of cleanup.splice(0).reverse()) {
      await rm(directory, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
    }
  });

  afterAll(async () => {
    await rm(template, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
  });
}
