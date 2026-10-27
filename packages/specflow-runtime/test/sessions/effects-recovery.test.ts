import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { bootstrapProjectHome, inspectWorkspaceExecution } from '@nevo/specflow-engine/testing';
import {
  createEngineSessionEffects,
  workspaceExecutionIdentity,
} from '../../src/features/sessions/effects/engine';
import { createSessionCoordinator } from '../../src/features/sessions/lifecycle/coordinator';
import { openSessionStore, type SessionStore } from '../../src/features/sessions/persistence/store';
import type { StartAdmission } from '../../src/features/sessions/persistence/protocol';
import { createMockDriver } from '../../src/features/sessions/providers/mock';

let root = '';
let store: SessionStore | undefined;
afterEach(async () => {
  await store?.close();
  store = undefined;
  // root is the exact directory returned by mkdtemp for this test.
  if (root) await rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 });
});
it(
  'recovers the SQLite-only admission cut through a durable Engine not-dispatched record, without provider launch',
  async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'session-effect-recovery-')));
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: root, windowsHide: true, stdio: 'pipe' });
    git('init', '-q');
    await mkdir(join(root, '.nevo'));
    await writeFile(join(root, '.gitignore'), '.nevo/local/\n');
    await writeFile(join(root, '.nevo/config.yaml'), 'runtime: {}\ngit:\n  enabled: false\n');
    git('add', '.gitignore', '.nevo/config.yaml');
    git(
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-qm',
      'initial',
    );
    const engine = await bootstrapProjectHome(root);
    const directory = join(root, 'store');
    store = await openSessionStore({ directory, projectId: engine.context.project.projectId });
    const actor = 'actor';
    const { sessionId } = await store.call<{ sessionId: string }>({
      op: 'create',
      actor,
      input: {
        requestId: randomUUID(),
        providerId: 'controlled',
        mode: 'workspace-write',
        providerModeId: 'acceptEdits',
      },
    });
    const started = await store.call<StartAdmission>({
      op: 'start',
      actor,
      sessionId,
      input: { requestId: randomUUID(), message: 'Never dispatched' },
      nativeWorkspace: root,
      nativeScope: 'account',
      nativeWorkspaceIdentity: workspaceExecutionIdentity(engine),
      effectBinding: 'a'.repeat(64),
    });
    expect(await inspectWorkspaceExecution(engine, started.invocationId)).toBeUndefined();
    await expect(
      store.call({
        op: 'fact',
        sessionId,
        turnId: started.turnId,
        invocationId: started.invocationId,
        driverSeq: 1,
        fact: { kind: 'outcome', outcome: 'completed' },
      }),
    ).rejects.toMatchObject({ code: 'SESSION_RECOVERY_REQUIRED' });
    // Restart at the persisted SQLite-only cut. No native process has been allocated.
    await store.close();
    store = await openSessionStore({ directory, projectId: engine.context.project.projectId });
    const start = vi.fn(() => {
      throw new Error('Recovery must not launch a provider');
    });
    const coordinator = createSessionCoordinator(
      store,
      { ...createMockDriver(), start },
      engine.context.project.projectId,
      true,
      {
        kind: 'read-only',
        workspace: root,
        temporaryRoot: join(root, 'temporary'),
        workspaceIdentity: workspaceExecutionIdentity(engine),
      },
      createEngineSessionEffects(engine),
    );
    expect((await coordinator.snapshot(sessionId, actor)).activeTurn?.state).toBe('unknown');
    const requestId = randomUUID();
    const result = await coordinator.reconcile(actor, sessionId, started.turnId, requestId);
    expect(result).toMatchObject({ outcome: 'interrupted', reconciled: true });
    expect(await coordinator.reconcile(actor, sessionId, started.turnId, requestId)).toEqual(
      result,
    );
    expect((await coordinator.snapshot(sessionId, actor)).activeTurn).toBeUndefined();
    expect(await inspectWorkspaceExecution(engine, started.invocationId)).toMatchObject({
      phase: 'settled',
      settlement: { kind: 'not-dispatched' },
    });
    expect(start).not.toHaveBeenCalled();
  },
  process.platform === 'win32' ? 120000 : 30000,
);
