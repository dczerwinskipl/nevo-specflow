// A write Turn of a Specification's Session, end to end over the real Session store, the real Engine
// (Git on, automatic commits off) and the real broker endpoint (a named pipe or a Unix socket): the
// agent's CLI call path creates a typed document as the Turn's own claim, while every other writer is
// refused, a forged or ended capability is refused, a path another author left uncommitted is
// refused, and the capability never reaches what the Session store keeps. Real Git: run on Linux
// (tools/dev/linux-test.sh) for the full suite.
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AgentBrokerOperation, AgentBrokerResponse } from '@nevo/specflow-contracts/runtime';
import {
  DocumentError,
  applyDocumentChange,
  readSpecificationUncommitted,
} from '@nevo/specflow-engine';
import {
  bootstrapProjectHome,
  inspectWorkspaceExecution,
  serializeSpecificationManifest,
} from '@nevo/specflow-engine/testing';
import { afterEach, expect, it, vi } from 'vitest';

import { createAgentExecutionFeature } from '../../src/features/agent-execution';
import {
  agentBrokerEnvironment,
  sendAgentBrokerRequest,
} from '../../src/features/agent-execution/broker/client';
import {
  createEngineSessionEffects,
  workspaceExecutionIdentity,
} from '../../src/features/sessions/effects/engine';
import {
  createSessionCoordinator,
  type SessionCoordinator,
} from '../../src/features/sessions/lifecycle/coordinator';
import { openSessionStore } from '../../src/features/sessions/persistence/store';
import { createWritableTestDriver } from '../../src/features/sessions/providers/mock-write.test-support';
import { createSpecificationWorkspaceResolver } from '../../src/features/sessions/workspace/specification-workspace';

let root = '';
let coordinator: SessionCoordinator | undefined;
let closeBroker: (() => Promise<void>) | undefined;
afterEach(async () => {
  await coordinator?.close();
  coordinator = undefined;
  await closeBroker?.();
  closeBroker = undefined;
  if (root) {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
});

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

async function project() {
  root = await realpath(await mkdtemp(join(tmpdir(), 'agent-broker-')));
  const checkout = join(root, 'checkout');
  await mkdir(checkout);
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: checkout, windowsHide: true, stdio: 'pipe' });
  git('init', '-q');
  git('config', '--local', 'core.autocrlf', 'false');
  await mkdir(join(checkout, '.nevo'));
  await writeFile(join(checkout, '.gitignore'), '.nevo/local/\n');
  await writeFile(join(checkout, '.nevo/config.yaml'), 'runtime: {}\ngit:\n  enabled: true\n');
  const specId = randomUUID();
  const dir = join(checkout, 'specs', 'active', 'hand');
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'specification.yaml'),
    serializeSpecificationManifest({
      specId,
      slug: 'hand',
      title: 'Hand',
      archetype: {
        id: 'minimal',
        version: 1,
        requirements: [{ documentType: 'overview', minCount: 1 }],
      },
      documents: [
        { id: 'overview', path: 'overview.md', type: 'overview' },
        { id: 'notes', path: 'notes.md', type: 'notes' },
      ],
      folders: [],
      location: 'active',
      priority: 10,
      created: '2026-11-20',
    }),
  );
  await writeFile(join(dir, 'overview.md'), '# Hand\n');
  await writeFile(join(dir, 'notes.md'), 'notes\n');
  git('add', '.');
  git('-c', 'user.name=T', '-c', 'user.email=t@example.invalid', 'commit', '-qm', 'initial');

  return { checkout, specId, engine: await bootstrapProjectHome(checkout) };
}

it(
  'lets a write Turn create a typed document through the broker while every other writer is refused',
  async () => {
    const { checkout, specId, engine } = await project();
    // A person's uncommitted save (automatic commits are off): its ledger entry is another author's.
    await applyDocumentChange(engine, specId, randomUUID(), {
      action: 'save',
      documentId: 'notes',
      content: 'person\n',
      expectedRevision: sha256('notes\n'),
    });

    const agentExecution = createAgentExecutionFeature({ engine });
    closeBroker = () => agentExecution.close();
    const seen: Record<string, unknown> = {};
    let capability = '';
    let endpoint = '';
    let invocationId = '';
    const driver = createWritableTestDriver(async (invocation, emit) => {
      invocationId = invocation.invocationId;
      const broker = agentBrokerEnvironment(invocation.runtimeEnvironment?.values ?? {})!;
      ({ capability, endpoint } = broker);
      const add: AgentBrokerOperation = {
        name: 'documents.create',
        specId,
        documents: [{ path: 'plan.md', type: 'notes', content: '# Plan\n' }],
      };
      seen.created = await sendAgentBrokerRequest({
        ...broker,
        requestId: 'add-plan',
        operation: add,
      });
      seen.replayed = await sendAgentBrokerRequest({
        ...broker,
        requestId: 'add-plan',
        operation: add,
      });
      seen.foreignLedger = await sendAgentBrokerRequest({
        ...broker,
        requestId: 'save-notes',
        operation: {
          name: 'documents.save',
          specId,
          documentId: 'notes',
          content: 'agent\n',
          expectedRevision: sha256('person\n'),
        },
      });
      seen.forged = await sendAgentBrokerRequest({
        ...broker,
        capability: 'nvcap_' + 'q'.repeat(43),
        requestId: 'add-other',
        operation: add,
      });
      // Another writer of the project during the Turn: the claim refuses it.
      seen.otherWriter = await applyDocumentChange(engine, specId, randomUUID(), {
        action: 'save',
        documentId: 'overview',
        content: '# Other\n',
        expectedRevision: sha256('# Hand\n'),
      }).catch((error: unknown) => error);
      // The agent prints its environment: the store keeps no capability.
      await emit({
        kind: 'text',
        key: 'env',
        channel: 'tool-output',
        text: `NEVO_AGENT_CAPABILITY=${broker.capability}`,
      });
    });

    const store = await openSessionStore({
      directory: join(root, 'store'),
      projectId: engine.context.project.projectId,
    });
    coordinator = createSessionCoordinator(
      store,
      driver,
      engine.context.project.projectId,
      true,
      {
        kind: 'read-only',
        workspace: checkout,
        temporaryRoot: join(root, 'temporary'),
        workspaceIdentity: workspaceExecutionIdentity(engine),
      },
      createEngineSessionEffects(engine),
      createSpecificationWorkspaceResolver(engine),
      undefined,
      agentExecution.capabilities,
    );
    const actor = 'actor';
    const { sessionId } = await coordinator.create(
      actor,
      {
        requestId: randomUUID(),
        providerId: 'controlled',
        mode: 'workspace-write',
        providerModeId: 'acceptEdits',
      },
      { specId, taskIds: [], origin: 'user' },
    );
    await coordinator.start(actor, sessionId, { requestId: randomUUID(), message: 'Add a plan' });
    await vi.waitFor(
      async () => {
        expect((await coordinator!.snapshot(sessionId, actor)).activeTurn).toBeUndefined();
      },
      { timeout: 60_000 },
    );

    expect(seen.created).toMatchObject({
      ok: true,
      value: {
        operation: 'documents.create',
        result: { documents: [{ path: 'plan.md', type: 'notes' }] },
      },
    });
    const created = seen.created as Extract<AgentBrokerResponse, { ok: true }>;
    const replayed = seen.replayed as Extract<AgentBrokerResponse, { ok: true }>;
    const operationOf = (value: (typeof created)['value']) =>
      'result' in value && 'operationId' in value.result ? value.result.operationId : undefined;
    expect(replayed.ok && operationOf(replayed.value)).toBe(operationOf(created.value));
    expect(seen.foreignLedger).toMatchObject({
      ok: false,
      error: { code: 'DOCUMENT_COMMITS_PENDING', details: { cause: 'foreign-uncommitted' } },
    });
    expect(seen.forged).toMatchObject({
      ok: false,
      error: { code: 'AGENT_CAPABILITY_INVALID' },
    });
    expect(seen.otherWriter).toBeInstanceOf(DocumentError);
    expect(seen.otherWriter).toMatchObject({ code: 'SPEC_BUSY', details: { cause: 'agent-turn' } });

    // The agent's write is published and uncommitted, attributed to the Turn's operation.
    expect(await readFile(join(checkout, 'specs/active/hand/plan.md'), 'utf8')).toBe('# Plan\n');
    expect(
      (await readSpecificationUncommitted(engine, specId)).entries.map((e) => e.path),
    ).toContain('specs/active/hand/plan.md');
    expect(await inspectWorkspaceExecution(engine, invocationId)).toMatchObject({
      phase: 'settled',
    });

    // The capability died with the Turn.
    expect(
      await sendAgentBrokerRequest({
        endpoint,
        capability,
        requestId: 'after-turn',
        operation: { name: 'scope.describe' },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'AGENT_CAPABILITY_INVALID', details: { reason: 'ended' } },
    });

    // Nothing the Session store keeps holds the value (database and its write-ahead log).
    await coordinator.close();
    coordinator = undefined;
    for (const name of await readdir(join(root, 'store'), { recursive: true })) {
      const bytes = await readFile(join(root, 'store', name)).catch(() => undefined);
      expect(bytes?.includes(capability)).not.toBe(true);
    }

    await closeBroker();

    // A Runtime restart: a new broker and capability registry, nothing kept in memory. The next
    // Turn of the same Session still authors its earlier uncommitted write; another Session does not.
    const restarted = createAgentExecutionFeature({ engine });
    closeBroker = () => restarted.close();
    let script: (env: { endpoint: string; capability: string }) => Promise<void> = () =>
      Promise.resolve();
    const reopened = await openSessionStore({
      directory: join(root, 'store'),
      projectId: engine.context.project.projectId,
    });
    coordinator = createSessionCoordinator(
      reopened,
      createWritableTestDriver((invocation) =>
        script(agentBrokerEnvironment(invocation.runtimeEnvironment?.values ?? {})!),
      ),
      engine.context.project.projectId,
      true,
      {
        kind: 'read-only',
        workspace: checkout,
        temporaryRoot: join(root, 'temporary'),
        workspaceIdentity: workspaceExecutionIdentity(engine),
      },
      createEngineSessionEffects(engine),
      createSpecificationWorkspaceResolver(engine),
      undefined,
      restarted.capabilities,
    );
    const turn = async (session: string, run: typeof script) => {
      script = run;
      await coordinator!.start(actor, session, { requestId: randomUUID(), message: 'Edit' });
      await vi.waitFor(
        async () => {
          expect((await coordinator!.snapshot(session, actor)).activeTurn).toBeUndefined();
        },
        { timeout: 60_000 },
      );
    };

    const savePlan = (content: string, revision: string): AgentBrokerOperation => ({
      name: 'documents.save',
      specId,
      documentId: (seen.created as { value: { result: { documents: { id: string }[] } } }).value
        .result.documents[0]!.id,
      content,
      expectedRevision: sha256(revision),
    });
    await turn(sessionId, async (broker) => {
      seen.ownAfterRestart = await sendAgentBrokerRequest({
        ...broker,
        requestId: 'save-plan',
        operation: savePlan('# Plan 2\n', '# Plan\n'),
      });
    });
    expect(seen.ownAfterRestart).toMatchObject({ ok: true });
    const { sessionId: otherSession } = await coordinator.create(
      actor,
      {
        requestId: randomUUID(),
        providerId: 'controlled',
        mode: 'workspace-write',
        providerModeId: 'acceptEdits',
      },
      { specId, taskIds: [], origin: 'user' },
    );
    await turn(otherSession, async (broker) => {
      seen.otherSession = await sendAgentBrokerRequest({
        ...broker,
        requestId: 'save-plan',
        operation: savePlan('# Plan 3\n', '# Plan 2\n'),
      });
    });
    expect(seen.otherSession).toMatchObject({
      ok: false,
      error: { code: 'DOCUMENT_COMMITS_PENDING', details: { cause: 'foreign-uncommitted' } },
    });
  },
  process.platform === 'win32' ? 180_000 : 60_000,
);
