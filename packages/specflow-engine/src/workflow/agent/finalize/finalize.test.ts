import { beforeAll, describe, expect, it } from 'vitest';

import { createDefaultDefinitionRegistry } from '../../../definitions/shipped-registry';
import type { WorkspaceExecutionIntent } from '../../../execution/model';
import { loadDefinitions } from '../../../specs/definitions/loader';
import { MemoryDefinitionSource } from '../../../specs/definitions/test-support';
import { resolveExecutionCatalogue, type ExecutionCatalogue } from '../../definitions/catalogue';
import { SpecificationBusyError } from '../../errors';
import {
  SPEC,
  owner,
  positionOf,
  seedDefinitionFiles,
  seedExecutionCatalogue,
  specification,
} from '../../operations/operations.test-support';
import type { PostActionResult } from '../../operations/post-actions';
import type { AgentActor } from '../../state/model';
import { agentPostActionId, type AgentReturnRequest } from '../journal/model';
import { memoryAgentDependencies } from '../memory.test-support';
import { proposeAgentFinish, type AgentTurnIdentity } from '../proposal/propose';
import { readAgentAttemptWork } from '../history/attempt';
import { startAgentAttempt } from '../start';
import { finalizeAgentAttempt, type FinalizeBoundary } from './finalize';
import {
  recoverAgentAttempts,
  retryAgentAttemptCommit,
  retryAgentPostActions,
  runAgentPostActions,
} from './post-actions';

/** The seed definitions with an exit gate on `requirements`: a `note` of the Specification. */
async function gatedCatalogue(): Promise<ExecutionCatalogue> {
  const files = await seedDefinitionFiles();
  const workflow = files['workflow/specification-standard.yaml'] ?? '';
  files['workflow/specification-standard.yaml'] = workflow.replace(
    '    purpose: A shared, owner-confirmed picture of the goal, scope and acceptance.\n',
    [
      '    purpose: A shared, owner-confirmed picture of the goal, scope and acceptance.',
      '    exitGates:',
      '      - type: document',
      '        documentType: note',
      '',
    ].join('\n'),
  );
  const loaded = await loadDefinitions(
    new MemoryDefinitionSource(files),
    createDefaultDefinitionRegistry(),
  );
  expect([...(loaded.invalid.get('workflow') ?? [])]).toEqual([]);

  return resolveExecutionCatalogue(loaded);
}

let catalogue: ExecutionCatalogue;
let gated: ExecutionCatalogue;

beforeAll(async () => {
  [catalogue, gated] = await Promise.all([seedExecutionCatalogue(), gatedCatalogue()]);
});

const WORKSPACE = '1f0c6a52-6a43-4c55-9d3e-1b7a5d2f8c01';
const ATTEMPT_ID = '2a1d7b63-7b54-4d66-8e4f-2c8b6e3a9d02';
const INVOCATION_1 = '3b2e8c74-8c65-4e77-9f5a-3d9c7f4bae03';
const INVOCATION_2 = '4c3f9d85-9d76-4f88-8a6b-4eadb05cbf04';
const writer: AgentActor = {
  class: 'agent',
  details: { archetype: 'spec-writer', provider: 'claude', sessionId: 'session-a' },
};
const ACTIVE = { state: 'active', step: 'requirements', attempt: 1 } as const;
const COMMITTED: PostActionResult[] = [{ action: 'attempt-commit', status: 'completed' }];
const NOTHING_RECOVERED = { recovered: [], failed: [], unreadable: [], truncated: false };
const AT = expect.any(String) as unknown;

const intentOf = (invocationId: string): WorkspaceExecutionIntent => ({
  operationId: invocationId,
  ownerId: 'session-a',
  binding: 'c'.repeat(64),
});
const finalizeInput = (invocationId = INVOCATION_1) => ({
  attemptId: ATTEMPT_ID,
  intent: intentOf(invocationId),
  receipt: { invocationId, process: 'stopped' as const, outcome: 'completed' as const },
});
const turn = (invocationId = INVOCATION_1): AgentTurnIdentity => ({
  attemptId: ATTEMPT_ID,
  invocationId,
  actor: writer,
  subject: specification,
  step: 'requirements',
  attempt: 1,
});

type Fixture = ReturnType<typeof memoryAgentDependencies>;

/** An agent attempt of `requirements` whose first Turn is dispatched (`proposal`: it proposed). */
async function agentTurn(
  options: {
    proposal?: boolean;
    phase?: 'dispatched' | 'unknown';
    catalogue?: ExecutionCatalogue;
  } = {},
) {
  const fixture = memoryAgentDependencies(options.catalogue ?? catalogue, ATTEMPT_ID);
  const { dependencies, claims } = fixture;
  claims.set(INVOCATION_1, { phase: 'dispatched' });
  await startAgentAttempt(dependencies, {
    subject: specification,
    archetype: 'feature',
    actor: writer,
    expected: { step: 'requirements' },
    workspaceId: WORKSPACE,
    turn: { invocationId: INVOCATION_1, turnId: 'turn-1' },
  });
  if (options.proposal !== false) {
    await proposeAgentFinish(dependencies, { turn: turn(), input: {} });
  }

  // The Turn ended: its claim no longer admits its own writes.
  fixture.state.claimDispatched = false;
  claims.set(INVOCATION_1, { phase: options.phase ?? 'dispatched' });
  fixture.events.length = 0;

  return fixture;
}

/** The owner continues the attempt with a second, dispatched Turn. */
async function continueAttempt(fixture: Fixture) {
  fixture.claims.set(INVOCATION_2, { phase: 'dispatched' });
  fixture.state.claimDispatched = true;
  await startAgentAttempt(fixture.dependencies, {
    subject: specification,
    archetype: 'feature',
    actor: writer,
    expected: { step: 'requirements', attempt: 1 },
    workspaceId: WORKSPACE,
    turn: { invocationId: INVOCATION_2, turnId: 'turn-2' },
  });
}

/** What the owner's Return during the attempt records (T15). */
function requestReturn(fixture: Fixture, step: string) {
  const stored = fixture.journal.journals.get(ATTEMPT_ID)!;
  const returnRequest: AgentReturnRequest = {
    step,
    feedback: 'Start again from the goals.',
    actor: owner,
    requestedAt: '2026-11-05T10:10:00.000Z',
    state: 'requested',
  };
  fixture.journal.journals.set(ATTEMPT_ID, { ...stored, returnRequest });
}

/** The finishes of the attempt that reached the store. */
const finishes = (fixture: Fixture) =>
  fixture.workflow.store.applied.filter((change) =>
    change.summary?.startsWith('finish step requirements'),
  ).length;

describe('finalizeAgentAttempt', () => {
  it('publishes the step, then settles the claim, in one lock section; post actions run after it', async () => {
    const fixture = await agentTurn();
    const { dependencies, events, state, journal } = fixture;
    const sections = state.sections;

    const result = await finalizeAgentAttempt(dependencies, finalizeInput());

    expect(result).toMatchObject({
      kind: 'finished',
      transition: 'agreed',
      finish: { transition: 'agreed' },
      postActions: COMMITTED,
    });
    expect(events).toEqual([
      'lock',
      // What the finish was judged on, before the step state is published.
      'journal',
      'store',
      'journal',
      'settle',
      'unlock',
      'post-action',
      'lock',
      'journal',
      'journal-settled',
      'unlock',
    ]);
    // The finalize section once, then the short section recording the post action done.
    expect(state.sections - sections).toBe(2);
    expect(fixture.admitted.at(-1)).toEqual({ operationId: INVOCATION_1, form: 'finalize' });
    expect(fixture.claims.get(INVOCATION_1)?.phase).toBe('settled');
    expect(await positionOf(fixture.workflow, specification)).not.toEqual(ACTIVE);
    expect(journal.journals.has(ATTEMPT_ID)).toBe(false);
    expect(journal.settled.get(ATTEMPT_ID)).toMatchObject({
      proposal: { state: 'finalized' },
      turns: [{ invocationId: INVOCATION_1, finalizedAt: AT }],
      dirtySet: { invocationId: INVOCATION_1, paths: [{ path: 'src/a.ts' }] },
      postActions: [
        {
          kind: 'attempt-commit',
          operationId: agentPostActionId(ATTEMPT_ID, 'attempt-commit'),
          state: 'done',
          outcomes: COMMITTED,
          runs: 1,
        },
      ],
    });
  });

  it('finalizes a Turn whose claim is unknown, and replays it without a second finish', async () => {
    const fixture = await agentTurn({ phase: 'unknown' });
    const { dependencies } = fixture;

    expect((await finalizeAgentAttempt(dependencies, finalizeInput())).kind).toBe('finished');
    expect(fixture.claims.get(INVOCATION_1)?.phase).toBe('settled');
    fixture.events.length = 0;

    const replayed = await finalizeAgentAttempt(dependencies, finalizeInput());
    expect(replayed).toEqual({ kind: 'finished', transition: 'agreed', postActions: [] });
    expect(finishes(fixture)).toBe(1);
    expect(fixture.events).not.toContain('store');
    expect(fixture.events).not.toContain('post-action');
  });

  it.each<FinalizeBoundary>([
    'step-published',
    'attempt-recorded',
    'claim-settled',
    'post-actions-pending',
  ])(
    'recovers a crash at %s: no duplicate finish, no settlement before it, no gap',
    async (boundary) => {
      const fixture = await agentTurn();
      const { dependencies, claims, state, events } = fixture;
      state.fault = boundary;

      await expect(finalizeAgentAttempt(dependencies, finalizeInput())).rejects.toThrow(
        `Crash at ${boundary}.`,
      );
      // The step state is published before anything else; the claim never settles before it.
      expect(finishes(fixture)).toBe(1);
      const settled = claims.get(INVOCATION_1)?.phase === 'settled';
      expect(settled).toBe(boundary === 'claim-settled' || boundary === 'post-actions-pending');
      expect(events).not.toContain('post-action');

      if (settled) {
        // Startup recovery resumes the post actions the crash left pending.
        expect(await recoverAgentAttempts(dependencies)).toEqual({
          ...NOTHING_RECOVERED,
          recovered: [{ attemptId: ATTEMPT_ID, postActions: COMMITTED }],
        });
      } else {
        // The claim is still held: post actions wait, the Runtime's recovery runs the same finalize.
        expect(await recoverAgentAttempts(dependencies)).toEqual(NOTHING_RECOVERED);
        expect(events).not.toContain('post-action');
        expect((await finalizeAgentAttempt(dependencies, finalizeInput())).kind).toBe('finished');
      }

      expect(finishes(fixture)).toBe(1);
      expect(claims.get(INVOCATION_1)?.phase).toBe('settled');
      expect(events.filter((event) => event === 'post-action')).toHaveLength(1);
      expect(fixture.journal.settled.get(ATTEMPT_ID)?.postActions?.[0]?.state).toBe('done');
      expect(await recoverAgentAttempts(dependencies)).toEqual(NOTHING_RECOVERED);
    },
  );

  it('finalizes a proposal recorded before a crash of its Turn, on recovery', async () => {
    // The proposal is recorded; the Runtime crashed before the Turn's end was finalized.
    const fixture = await agentTurn({ phase: 'unknown' });

    expect(await recoverAgentAttempts(fixture.dependencies)).toEqual(NOTHING_RECOVERED);
    expect(await positionOf(fixture.workflow, specification)).toEqual(ACTIVE);
    expect((await finalizeAgentAttempt(fixture.dependencies, finalizeInput())).kind).toBe(
      'finished',
    );
    expect(finishes(fixture)).toBe(1);
  });

  it('settles the claim when the re-validation refuses, and the agent fixes it in a new Turn', async () => {
    const fixture = await agentTurn({ catalogue: gated, proposal: false });
    const { dependencies, journal, workflow } = fixture;
    // The gate holds when the agent proposes ...
    workflow.references.gateDocuments.push({ type: 'note', id: 'notes', present: true });
    fixture.state.claimDispatched = true;
    await proposeAgentFinish(dependencies, { turn: turn(), input: {} });
    fixture.state.claimDispatched = false;
    // ... and no longer when its Turn is finalized.
    workflow.references.gateDocuments.length = 0;

    expect(await finalizeAgentAttempt(dependencies, finalizeInput())).toMatchObject({
      kind: 'refused',
      of: 'proposal',
      refusal: { code: 'WORKFLOW_GATE_UNSATISFIED' },
    });
    expect(fixture.claims.get(INVOCATION_1)?.phase).toBe('settled');
    expect(await positionOf(workflow, specification)).toEqual(ACTIVE);
    expect(journal.journals.get(ATTEMPT_ID)).toMatchObject({
      proposal: { state: 'refused', refusal: { code: 'WORKFLOW_GATE_UNSATISFIED' } },
      turns: [{ finalizedAt: AT }],
    });
    expect(journal.journals.get(ATTEMPT_ID)?.postActions).toBeUndefined();
    expect(fixture.events).not.toContain('post-action');

    // The owner continues: the agent adds the note and proposes again; its finalize publishes it.
    await continueAttempt(fixture);
    workflow.references.gateDocuments.push({ type: 'note', id: 'notes', present: true });
    expect(
      (await proposeAgentFinish(dependencies, { turn: turn(INVOCATION_2), input: {} })).kind,
    ).toBe('replaced');
    expect((await finalizeAgentAttempt(dependencies, finalizeInput(INVOCATION_2))).kind).toBe(
      'finished',
    );
    // The first Turn's finalize, run again, changes nothing.
    expect((await finalizeAgentAttempt(dependencies, finalizeInput())).kind).toBe('finished');
    expect(finishes(fixture)).toBe(1);
  });

  it('judges the attribution at the proposal, at the finalize and at Continue', async () => {
    const fixture = await agentTurn({ proposal: false });
    const { dependencies, journal, state } = fixture;
    const code = (sha: string) => ({
      path: 'src/a.ts',
      sha256: sha.repeat(64),
      added: false,
      area: { kind: 'code' as const },
    });
    state.attribution = { paths: [code('b')], incomplete: false };
    state.claimDispatched = true;
    await expect(
      proposeAgentFinish(dependencies, { turn: turn(), input: {} }),
    ).rejects.toMatchObject({
      code: 'WORKFLOW_UNDECLARED_CHANGES',
      attribution: { undeclared: ['src/a.ts'] },
    });
    const changes = { paths: ['src/a.ts'] };
    await proposeAgentFinish(dependencies, { turn: turn(), input: {}, changes });
    state.claimDispatched = false;
    // A Task file written past the Engine after the proposal: the finalize refuses, naming it.
    const task = 'specs/active/demo/tasks/t-01/task.md';
    state.attribution = {
      paths: [
        code('b'),
        {
          path: task,
          sha256: 'c'.repeat(64),
          added: false,
          area: { kind: 'specification', registered: true },
          engine: [
            {
              sha256: 'd'.repeat(64),
              source: 'ledger' as const,
              operationIds: ['op-1'],
              operationCount: 1,
              executions: [],
              latest: true,
            },
          ],
        },
      ],
      incomplete: false,
    };

    expect(await finalizeAgentAttempt(dependencies, finalizeInput())).toMatchObject({
      kind: 'refused',
      refusal: { code: 'WORKFLOW_ENGINE_FILE_EDITED', attribution: { paths: [task], count: 1 } },
    });
    expect(journal.journals.get(ATTEMPT_ID)?.proposal).toMatchObject({ changes, state: 'refused' });
    // Someone edits the agent's file between the Turns: Continue is refused until it is undone.
    state.attribution = { paths: [code('e')], incomplete: false };
    await expect(continueAttempt(fixture)).rejects.toMatchObject({
      code: 'WORKFLOW_BASELINE_CHANGED',
      attribution: { paths: ['src/a.ts'], count: 1 },
    });
    state.attribution = { paths: [code('b')], incomplete: false };
    await continueAttempt(fixture);
    expect(journal.journals.get(ATTEMPT_ID)?.turns).toHaveLength(2);
  });

  it('keeps the claim held and the proposal pending on a busy refusal, which passes', async () => {
    const fixture = await agentTurn();
    fixture.state.refuseStore = new SpecificationBusyError('A Close holds the Specification.', {
      cause: 'close',
    });

    await expect(finalizeAgentAttempt(fixture.dependencies, finalizeInput())).rejects.toMatchObject(
      { code: 'WORKFLOW_SPECIFICATION_BUSY' },
    );
    expect(fixture.claims.get(INVOCATION_1)?.phase).toBe('dispatched');
    expect(fixture.journal.journals.get(ATTEMPT_ID)?.proposal?.state).toBe('pending');
    expect((await finalizeAgentAttempt(fixture.dependencies, finalizeInput())).kind).toBe(
      'finished',
    );
  });

  it('waits for a document write of the Turn that is still being written', async () => {
    const fixture = await agentTurn();
    fixture.state.openWrites = ['6f7a1ba7-1f98-4baa-8c8d-6acfd27ed007'];

    await expect(finalizeAgentAttempt(fixture.dependencies, finalizeInput())).rejects.toMatchObject(
      { code: 'WORKFLOW_SPECIFICATION_BUSY', busy: { cause: 'write-in-progress' } },
    );
    expect(fixture.events).toEqual(['lock', 'unlock']);
    expect(fixture.claims.get(INVOCATION_1)?.phase).toBe('dispatched');
    expect(fixture.journal.journals.get(ATTEMPT_ID)?.proposal?.state).toBe('pending');

    fixture.state.openWrites = [];
    expect((await finalizeAgentAttempt(fixture.dependencies, finalizeInput())).kind).toBe(
      'finished',
    );
  });

  it('settles the claim of a Turn that ended without a proposal and records its dirty set', async () => {
    const fixture = await agentTurn({ proposal: false });

    expect(await finalizeAgentAttempt(fixture.dependencies, finalizeInput())).toEqual({
      kind: 'turn-ended',
    });
    expect(fixture.claims.get(INVOCATION_1)?.phase).toBe('settled');
    expect(await positionOf(fixture.workflow, specification)).toEqual(ACTIVE);
    expect(fixture.events).not.toContain('store');
    expect(fixture.journal.journals.get(ATTEMPT_ID)).toMatchObject({
      turns: [{ invocationId: INVOCATION_1, finalizedAt: AT }],
      dirtySet: {
        invocationId: INVOCATION_1,
        paths: [{ path: 'src/a.ts', sha256: 'b'.repeat(64) }],
      },
    });
  });

  it("applies the owner's recorded return request once the Turn is proven stopped", async () => {
    const fixture = await agentTurn();
    const { dependencies, journal } = fixture;
    requestReturn(fixture, 'requirements');

    expect(await finalizeAgentAttempt(dependencies, finalizeInput())).toMatchObject({
      kind: 'returned',
    });
    const run = (await fixture.workflow.store.read(SPEC)).specification?.value.run;
    expect(run?.attempts[0]?.outcome).toMatchObject({ kind: 'returned', to: 'requirements' });
    expect(fixture.claims.get(INVOCATION_1)?.phase).toBe('settled');
    expect(journal.settled.get(ATTEMPT_ID)).toMatchObject({
      returnRequest: { state: 'applied' },
      proposal: { state: 'refused', refusal: { code: 'WORKFLOW_RETURN_REQUESTED' } },
    });
    const applied = fixture.workflow.store.applied.length;

    expect(await finalizeAgentAttempt(dependencies, finalizeInput())).toEqual({
      kind: 'returned',
    });
    expect(fixture.workflow.store.applied).toHaveLength(applied);
    expect(finishes(fixture)).toBe(0);
  });

  it('resolves the pending proposal with a refused return, so a later Turn finalizes', async () => {
    const fixture = await agentTurn();
    // A step the run has not reached: the return is refused when it is judged.
    requestReturn(fixture, 'breakdown');

    expect(await finalizeAgentAttempt(fixture.dependencies, finalizeInput())).toMatchObject({
      kind: 'refused',
      of: 'return',
    });
    expect(fixture.journal.journals.get(ATTEMPT_ID)?.proposal).toMatchObject({
      state: 'refused',
      refusal: { code: 'WORKFLOW_RETURN_REQUESTED' },
    });
    expect(fixture.claims.get(INVOCATION_1)?.phase).toBe('settled');

    // Continue, and that Turn ends without a proposal: its claim settles too.
    await continueAttempt(fixture);
    fixture.state.claimDispatched = false;
    expect(await finalizeAgentAttempt(fixture.dependencies, finalizeInput(INVOCATION_2))).toEqual({
      kind: 'turn-ended',
    });
    expect(fixture.claims.get(INVOCATION_2)?.phase).toBe('settled');
    expect(await positionOf(fixture.workflow, specification)).toEqual(ACTIVE);
    expect(finishes(fixture)).toBe(0);
  });

  it('keeps a failed attempt commit apart from the published step: recovery leaves it, Retry commit runs it once', async () => {
    const fixture = await agentTurn();
    const { dependencies, journal, state, events } = fixture;
    const failed: PostActionResult[] = [
      {
        action: 'attempt-commit',
        status: 'failed',
        code: 'DOCUMENT_COMMIT_REFUSED',
        message: 'Protected branch.',
      },
    ];
    state.postActionResults = failed;
    journal.unreadable.add('5e6f0a96-0e87-4a99-9b7c-5fbec16dc006');

    expect(await finalizeAgentAttempt(dependencies, finalizeInput())).toMatchObject({
      kind: 'finished',
      postActions: failed,
    });
    expect(await positionOf(fixture.workflow, specification)).not.toEqual(ACTIVE);
    expect(journal.journals.get(ATTEMPT_ID)?.postActions).toMatchObject([
      { state: 'failed', outcomes: [{ status: 'failed', code: 'DOCUMENT_COMMIT_REFUSED' }] },
    ]);
    // Still listed; recovery reports the unreadable journal and does not retry by itself.
    expect(await recoverAgentAttempts(dependencies)).toEqual({
      ...NOTHING_RECOVERED,
      unreadable: ['5e6f0a96-0e87-4a99-9b7c-5fbec16dc006'],
    });

    // The owner's Retry commit: a new operation (the failed one ended), run once.
    state.postActionResults = COMMITTED;
    const retry = { subject: specification, step: 'requirements', attempt: 1, actor: owner };
    await expect(
      retryAgentAttemptCommit(dependencies, { ...retry, attempt: 2 }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_MISMATCH' });
    expect(await retryAgentAttemptCommit(dependencies, retry)).toEqual({ postActions: COMMITTED });
    await expect(retryAgentAttemptCommit(dependencies, retry)).rejects.toMatchObject({
      code: 'WORKFLOW_POSITION_INVALID',
    });
    expect(await retryAgentPostActions(dependencies, ATTEMPT_ID)).toEqual([]);
    expect(events.filter((event) => event === 'post-action')).toHaveLength(2);
    const [first, second] = state.postActionRuns;
    expect(first).toBe(agentPostActionId(ATTEMPT_ID, 'attempt-commit'));
    expect(second).not.toBe(first);
    expect(journal.settled.get(ATTEMPT_ID)?.postActions?.[0]).toMatchObject({
      state: 'done',
      runs: 2,
    });
  });

  it('runs a post action once when the finalize and a recovery reach it at the same time', async () => {
    const fixture = await agentTurn();
    const { dependencies, state, events } = fixture;
    state.fault = 'post-actions-pending';
    await expect(finalizeAgentAttempt(dependencies, finalizeInput())).rejects.toThrow('Crash');

    const both = await Promise.all([
      runAgentPostActions(dependencies, ATTEMPT_ID),
      recoverAgentAttempts(dependencies),
    ]);
    expect(both[0]).toEqual(COMMITTED);
    expect(events.filter((event) => event === 'post-action')).toHaveLength(1);
    expect(fixture.journal.settled.get(ATTEMPT_ID)?.postActions?.[0]?.state).toBe('done');
  });

  it('keeps the attempt commit sha and counts what it committed, for the history', async () => {
    const fixture = await agentTurn({ proposal: false });
    const { dependencies, state, journal } = fixture;
    state.attribution = {
      paths: [{ path: 'src/a.ts', sha256: 'b'.repeat(64), added: false, area: { kind: 'code' } }],
      incomplete: false,
    };
    state.claimDispatched = true;
    await proposeAgentFinish(dependencies, {
      turn: turn(),
      input: {},
      changes: { paths: ['src/a.ts'] },
    });
    state.claimDispatched = false;
    const sha = 'e'.repeat(40);
    state.postActionResults = [
      {
        action: 'attempt-commit',
        status: 'completed',
        commit: {
          sha,
          paths: [
            'specs/active/demo/overview.md',
            'specs/active/demo/.execution/specification.yaml',
            'src/a.ts',
          ],
        },
      },
    ];

    await finalizeAgentAttempt(dependencies, finalizeInput());

    const settled = journal.settled.get(ATTEMPT_ID)!;
    expect(settled.postActions?.[0]?.outcomes).toEqual([
      {
        action: 'attempt-commit',
        status: 'completed',
        commit: {
          sha,
          documents: 2,
          files: 1,
          paths: [
            'specs/active/demo/.execution/specification.yaml',
            'specs/active/demo/overview.md',
            'src/a.ts',
          ],
        },
      },
    ]);
    expect((await readAgentAttemptWork(fixture.workflow, dependencies, settled)).commit).toEqual({
      state: 'committed',
      runs: 1,
      sha,
      documents: 2,
      files: 1,
    });
  });

  it('lists what a committed attempt changed once the ledger no longer holds it, by what it is', async () => {
    const fixture = await agentTurn({ proposal: false });
    const { dependencies, state, journal } = fixture;
    state.attribution = {
      paths: [{ path: 'src/a.ts', sha256: 'b'.repeat(64), added: false, area: { kind: 'code' } }],
      incomplete: false,
    };
    state.claimDispatched = true;
    await proposeAgentFinish(dependencies, {
      turn: turn(),
      input: {},
      changes: { paths: ['src/a.ts'] },
    });
    state.claimDispatched = false;
    const sha = 'e'.repeat(40);
    state.postActionResults = [
      {
        action: 'attempt-commit',
        status: 'completed',
        commit: {
          sha,
          paths: [
            'specs/active/demo/overview.md',
            'specs/active/demo/decisions.md',
            'specs/active/demo/.execution/specification.yaml',
            'specs/active/demo/specification.yaml',
            'src/a.ts',
          ],
        },
      },
    ];
    await finalizeAgentAttempt(dependencies, finalizeInput());
    const settled = journal.settled.get(ATTEMPT_ID)!;

    // The commit pruned the ledger: the work is what the commit held, not "no documents".
    const work = await readAgentAttemptWork(
      fixture.workflow,
      {
        ...dependencies,
        ledger: () => Promise.resolve([]),
        specification: () =>
          Promise.resolve({
            directory: 'specs/active/demo',
            documents: ['specs/active/demo/overview.md', 'specs/active/demo/decisions.md'],
          }),
      },
      settled,
    );

    expect(work.documents).toEqual([]);
    expect(work.changes).toEqual({
      directory: 'specs/active/demo',
      documents: ['specs/active/demo/decisions.md', 'specs/active/demo/overview.md'],
      tasks: [],
      files: ['src/a.ts'],
      state: [
        'specs/active/demo/.execution/specification.yaml',
        'specs/active/demo/specification.yaml',
      ],
    });
    // The counts name the same groups: two documents and one other file, the records uncounted.
    expect(work.commit).toEqual({ state: 'committed', runs: 1, sha, documents: 2, files: 1 });
  });

  it('replays a crash after the publication with the hashes it was judged on, not the checkout now', async () => {
    const fixture = await agentTurn({ proposal: false });
    const { dependencies, state, journal } = fixture;
    const code = (sha: string) => ({
      path: 'src/a.ts',
      sha256: sha.repeat(64),
      added: false,
      area: { kind: 'code' as const },
    });
    state.attribution = { paths: [code('b')], incomplete: false };
    state.claimDispatched = true;
    await proposeAgentFinish(dependencies, {
      turn: turn(),
      input: {},
      changes: { paths: ['src/a.ts'] },
    });
    state.claimDispatched = false;
    state.fault = 'step-published';
    await expect(finalizeAgentAttempt(dependencies, finalizeInput())).rejects.toThrow('Crash');
    expect(journal.journals.get(ATTEMPT_ID)?.proposal).toMatchObject({
      state: 'pending',
      judged: { declared: [{ path: 'src/a.ts', sha256: 'b'.repeat(64) }] },
    });

    // Someone edits the declared file before the finalize runs again.
    state.fault = undefined;
    state.attribution = { paths: [code('e')], incomplete: false };
    expect((await finalizeAgentAttempt(dependencies, finalizeInput())).kind).toBe('finished');
    expect(finishes(fixture)).toBe(1);
    expect(journal.settled.get(ATTEMPT_ID)?.postActions?.[0]?.declared).toEqual([
      { path: 'src/a.ts', sha256: 'b'.repeat(64) },
    ]);
  });

  it('refuses another Turn, a Turn never dispatched, or another receipt before anything changes', async () => {
    const fixture = await agentTurn();

    await expect(
      finalizeAgentAttempt(fixture.dependencies, finalizeInput(INVOCATION_2)),
    ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_MISMATCH' });
    fixture.claims.set(INVOCATION_1, { phase: 'admitted' });
    await expect(finalizeAgentAttempt(fixture.dependencies, finalizeInput())).rejects.toMatchObject(
      { code: 'EXECUTION_CONFLICT' },
    );
    fixture.claims.set(INVOCATION_1, {
      phase: 'settled',
      receipt: { invocationId: INVOCATION_1, process: 'stopped', outcome: 'failed' },
    });
    await expect(finalizeAgentAttempt(fixture.dependencies, finalizeInput())).rejects.toMatchObject(
      { code: 'EXECUTION_CONFLICT' },
    );
    expect(fixture.events).toEqual(['lock', 'unlock', 'lock', 'unlock', 'lock', 'unlock']);
    expect(await positionOf(fixture.workflow, specification)).toEqual(ACTIVE);
  });
});
