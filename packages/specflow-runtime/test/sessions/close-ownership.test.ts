// A Close outside the Runtime that owns the Session store (the CLI) asks the store's durable owner
// record whether an agent can work in the checkout it removes: refused while another process owns
// the store, after that owner's crash only for an unsettled native Turn in that checkout, and
// whenever the record cannot be read.
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { lstat, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { openSessionStore } from '../../src/features/sessions/persistence/store';
import { probeSessionStoreOwner } from '../../src/features/sessions/persistence/owner-probe';
import {
  inspectSessionStoreOwnership,
  quiescenceFromOwnership,
  runtimeCheckoutQuiescence,
} from '../../src/features/sessions/workspace/checkout-quiescence';
import {
  projectSessionStoreDirectory,
  sessionStoreCheckoutQuiescence,
  type SessionsRuntime,
} from '../../src/features/sessions';
import {
  bootstrapProjectHome,
  CloseOperationError,
  closeWorktreeOperation,
  createSpecificationForTesting,
  withCheckoutQuiescence,
  type SpecFlowEngine,
} from '@nevo/specflow-engine/testing';

const roots: string[] = [];
const children: ChildProcess[] = [];
afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited;
    }
  }

  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
  }
});

async function directories() {
  const root = await mkdtemp(join(tmpdir(), 'nevo-close-ownership-'));
  roots.push(root);
  const store = join(root, 'state', 'sessions');
  const checkout = join(root, 'worktree');
  const other = join(root, 'other-worktree');
  await mkdir(store, { recursive: true });

  return { store, checkout, other };
}

/**
 * A Runtime in another process: owns the store and, with `checkout`, has a dispatched native Turn
 * there.
 */
async function ownerProcess(directory: string, checkout?: string) {
  const entry = new URL('../../src/session-worker.ts', import.meta.url).href;
  const source = `
    import { Worker } from 'node:worker_threads';
    import { randomUUID } from 'node:crypto';
    const worker = new Worker(new URL(${JSON.stringify(entry)}), {
      execArgv: [],
      workerData: { kind: 'session-store', directory: ${JSON.stringify(directory)}, projectId: 'project', runtimeId: randomUUID(), pid: process.pid },
    });
    let sessionId;
    const send = (id, command) => worker.postMessage({ id, command });
    worker.on('message', (message) => {
      if (message.error) throw new Error(JSON.stringify(message.error));
      if (message.id === 0 && ${JSON.stringify(checkout === undefined)}) process.stdout.write('{}\\n');
      else if (message.id === 0) send(1, { op: 'create', actor: 'actor',
        input: { requestId: randomUUID(), providerId: 'claude', mode: 'read-only' } });
      if (message.id === 1) {
        sessionId = message.result.sessionId;
        send(2, { op: 'start', actor: 'actor', sessionId,
          input: { requestId: randomUUID(), message: 'working' },
          nativeWorkspace: ${JSON.stringify(checkout ?? '')}, nativeScope: 'account-a' });
      }
      if (message.id === 2) send(3, { op: 'dispatch-intent', sessionId,
        turnId: message.result.turnId, invocationId: message.result.invocationId });
      if (message.id === 3) process.stdout.write(JSON.stringify({ sessionId }) + '\\n');
    });
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  const ready = await new Promise<{ sessionId?: string }>((resolve, reject) => {
    let output = '',
      diagnostic = '';
    child.stdout.on('data', (chunk) => {
      output += String(chunk);
      if (output.includes('\n')) {
        resolve(JSON.parse(output.trim()) as { sessionId?: string });
      }
    });
    child.stderr.on('data', (chunk) => {
      diagnostic = (diagnostic + String(chunk)).slice(-8192);
    });
    child.on('exit', (code) => reject(new Error('Owner exited: ' + code + ' ' + diagnostic)));
  });

  return { child, sessionId: ready.sessionId };
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args],
    {
      cwd,
      encoding: 'utf8',
    },
  ).trim();
}

/** A Project with a Specification in its own linked worktree, committed and ready to close. */
async function linkedSpecification() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'nevo-close-owner-')));
  roots.push(root);
  git(root, 'init', '-q');
  await mkdir(join(root, '.nevo'));
  await writeFile(join(root, '.gitignore'), '.nevo/local/\n');
  await writeFile(join(root, '.nevo/config.yaml'), 'runtime: {}\ngit:\n  enabled: true\n');
  git(root, 'add', '.gitignore', '.nevo/config.yaml');
  git(root, 'commit', '-qm', 'initial');
  const branch = git(root, 'symbolic-ref', '--short', 'HEAD');
  await writeFile(
    join(root, '.nevo/config.yaml'),
    'runtime: {}\ngit:\n  enabled: true\n  integrationTargetBranch: ' + branch + '\n',
  );
  git(root, 'commit', '-qam', 'target branch');
  const engine = await bootstrapProjectHome(root);
  const spec = await createSpecificationForTesting(engine, {
    archetype: { id: 'minimal', version: 1 },
    operationId: randomUUID(),
    title: 'Closed outside the Runtime',
    created: '2026-11-16',
    target: { kind: 'new-worktree' as const, baseRef: 'HEAD' },
  });
  roots.push(dirname(spec.workspaceRoot));
  git(spec.workspaceRoot, 'add', '--', spec.relativeManifestPath, 'specs/active/' + spec.slug);
  if (git(spec.workspaceRoot, 'diff', '--cached', '--name-only') !== '') {
    git(spec.workspaceRoot, 'commit', '-qm', 'canonical source');
  }

  return { engine, spec };
}

const verdict = async (directory: string, checkout: string) =>
  quiescenceFromOwnership(await inspectSessionStoreOwnership(directory, checkout));

describe('Close outside the Session store owner', () => {
  it('follows the owner record across a live owner, its crash, a restart and a clean stop', async () => {
    const { store, checkout, other } = await directories();
    // No Runtime ever ran agent Sessions for the Project: no Turn can work anywhere.
    expect(await verdict(store, checkout)).toEqual({ quiet: true });

    const owner = await ownerProcess(store, checkout);
    expect(await inspectSessionStoreOwnership(store, checkout)).toEqual({
      kind: 'live',
      pid: owner.child.pid,
    });
    const refused = await verdict(store, other);
    expect(refused).toMatchObject({ quiet: false, sessionIds: [] });
    expect(refused.quiet || refused.message).toContain('process ' + owner.child.pid);

    // The owner dies with its Turn dispatched: its agent may still run in that checkout only.
    const exited = once(owner.child, 'exit');
    owner.child.kill('SIGKILL');
    await exited;
    expect(await verdict(store, checkout)).toMatchObject({
      quiet: false,
      sessionIds: [owner.sessionId],
    });
    expect(await verdict(store, other)).toEqual({ quiet: true });

    // A restarted Runtime owns the store again; once it stops cleanly the recovered Turn is still
    // unknown (never settled), so a Close of its checkout stays refused.
    const restarted = await openSessionStore({ directory: store, projectId: 'project' });
    try {
      expect(await inspectSessionStoreOwnership(store, other)).toEqual({
        kind: 'live',
        pid: process.pid,
      });
    } finally {
      await restarted.close();
    }

    expect(await inspectSessionStoreOwnership(store, checkout)).toEqual({
      kind: 'stopped',
      unsettledSessionIds: [owner.sessionId],
    });
    expect(await verdict(store, other)).toEqual({ quiet: true });
  }, 30000);

  it('a Close in another process than the live store owner is refused, and resumes once it stops', async () => {
    const { engine, spec } = await linkedSpecification();
    // What the CLI's Close runs with: it does not own the Session store.
    const cli = withCheckoutQuiescence(engine, sessionStoreCheckoutQuiescence(engine));
    const owner = await ownerProcess(projectSessionStoreDirectory(engine));
    const operationId = randomUUID();
    const refusal: unknown = await closeWorktreeOperation(cli, {
      operationId,
      specId: spec.specId,
    }).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(CloseOperationError);
    expect(refusal).toMatchObject({ code: 'CLOSE_BLOCKED' });
    expect((refusal as Error).message).toContain(
      'Close it from the SpecFlow UI, or stop that Runtime',
    );
    expect((await lstat(spec.workspaceRoot)).isDirectory()).toBe(true);

    const exited = once(owner.child, 'exit');
    owner.child.kill('SIGKILL');
    await exited;
    const closed = await closeWorktreeOperation(cli, { operationId, specId: spec.specId });
    expect(closed.status).toBe('completed');
    await expect(lstat(spec.workspaceRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  }, 150000);

  it('refuses when the owner record cannot be read or its owner cannot be proven stopped', async () => {
    const { store, checkout } = await directories();
    const owned = await openSessionStore({ directory: store, projectId: 'project' });
    try {
      // `EPERM` and similar answers of the process probe do not prove the owner stopped.
      expect(
        probeSessionStoreOwner(
          { kind: 'session-store-probe', directory: store, checkoutRoot: checkout },
          () => 'unknown',
        ),
      ).toEqual({ kind: 'unknown', reason: 'its owning Runtime process cannot be inspected' });
    } finally {
      await owned.close();
    }

    const { store: corrupt } = await directories();
    await writeFile(join(corrupt, 'sessions.sqlite'), 'not a database');
    const refused = await verdict(corrupt, checkout);
    expect(refused.quiet).toBe(false);
    expect(refused.quiet || refused.message).toMatch(/^Cannot tell whether a SpecFlow Runtime/);
  });

  it("the owning Runtime counts its running Turns and the store's unsettled ones", async () => {
    const running = new Map([['w1', ['session-1']]]);
    // An earlier run left `session-0` unknown in /w1 and `session-9` in /w3: in no occupancy.
    const unsettled = new Map([
      ['/w1', ['session-0', 'session-1']],
      ['/w3', ['session-9']],
    ]);
    const quiescence = runtimeCheckoutQuiescence({
      engine: { context: { project: { stateRoot: '/nonexistent' } } } as SpecFlowEngine,
      sessions: {
        coordinator: {
          unsettledTurnsIn: (root: string) => Promise.resolve(unsettled.get(root) ?? []),
        },
        projectId: 'project',
      } as unknown as SessionsRuntime,
      runningSessions: (workspaceId) => running.get(workspaceId) ?? [],
    });

    expect(await quiescence({ workspaceId: 'w1', root: '/w1' })).toMatchObject({
      quiet: false,
      sessionIds: ['session-1', 'session-0'],
    });
    expect(await quiescence({ workspaceId: 'w3', root: '/w3' })).toMatchObject({
      quiet: false,
      sessionIds: ['session-9'],
    });
    expect(await quiescence({ workspaceId: 'w2', root: '/w2' })).toEqual({ quiet: true });
  });

  it('the owning store reports a Turn an earlier run left unknown', async () => {
    const { store, checkout } = await directories();
    const owner = await ownerProcess(store, checkout);
    const exited = once(owner.child, 'exit');
    owner.child.kill('SIGKILL');
    await exited;
    // Restart recovery turns the dispatched Turn `unknown`; the new owner still reports it.
    const restarted = await openSessionStore({ directory: store, projectId: 'project' });
    try {
      expect(
        await restarted.call<readonly string[]>({ op: 'checkout-turns', root: checkout }),
      ).toEqual([owner.sessionId]);
    } finally {
      await restarted.close();
    }
  });
});
