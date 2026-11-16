// Crash windows of a managed write Turn and their recovery on native-stop evidence. A "crash"
// abandons the store Worker mid-Turn (no shutdown settlement) and frees its owner row, as a dead
// Runtime leaves them; the Engine is an in-memory claim journal with the real lifecycle rules.
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import type { TurnOutcome } from '@nevo/specflow-contracts/sessions';
import { createSessionCoordinator, type SessionCoordinator } from './coordinator';
import { openSessionStore, type SessionStore } from '../persistence/store';
import type { SessionEffects, SessionEffectIdentity } from './effects';
import type { SessionDriver, Invocation } from '../providers/driver';
import { createMockDriver } from '../providers/mock';
import { SessionError } from '../errors';
import { captureProcessIdentity } from '../providers/process/native-stop';
import type { NativeProcessIdentity } from '../providers/process/process-identity';
import { windowsKernel } from '../providers/process/windows-job';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

/** A real process standing in for the agent, with the identity a launch records for it. */
async function agentProcess(job = 'Local\\NevoSession-' + randomUUID()) {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    detached: process.platform !== 'win32',
    stdio: 'ignore',
  });
  await once(child, 'spawn');
  const identity = captureProcessIdentity(
    child.pid!,
    process.platform === 'win32' ? job : undefined,
  )!;
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited;
    }
  };

  cleanups.push(stop);

  return { identity, pid: child.pid!, stop };
}

/** The Engine claim journal: phases and settlement rules of `specflow-engine/execution`. */
function claimJournal() {
  let record:
    | {
        phase: 'admitted' | 'dispatched' | 'unknown' | 'settled';
        binding: string;
        settlement?: { kind: 'not-dispatched' } | { kind: 'native-result'; outcome: TurnOutcome };
      }
    | undefined;
  let hangDispatch = false;
  const counts = { released: 0, settleStopped: 0 };
  const refuse = () => Promise.reject(new SessionError('SESSION_RECOVERY_REQUIRED', 'Refused.'));
  function release(settlement: NonNullable<typeof record>['settlement']) {
    record = { ...record!, phase: 'settled', settlement };
    counts.released++;
  }

  const effects: SessionEffects = {
    admit(identity: SessionEffectIdentity) {
      record = { phase: 'admitted', binding: identity.binding };

      return Promise.resolve({
        workspace: identity.workspace,
        dispatch() {
          if (hangDispatch) {
            return new Promise<void>(() => undefined);
          }

          if (record?.phase !== 'admitted') {
            return refuse();
          }

          record.phase = 'dispatched';

          return Promise.resolve();
        },
        abandon() {
          if (record?.phase !== 'admitted') {
            return refuse();
          }

          release({ kind: 'not-dispatched' });

          return Promise.resolve();
        },
        unknown() {
          if (record && record.phase !== 'settled') {
            record.phase = 'unknown';
          }

          return Promise.resolve();
        },
        settle(evidence) {
          if (record?.phase !== 'dispatched' && record?.phase !== 'unknown') {
            return refuse();
          }

          release({ kind: 'native-result', outcome: evidence.outcome });

          return Promise.resolve();
        },
      });
    },
    reconcile(identity) {
      if (!record) {
        return Promise.resolve(undefined);
      }

      if (record.binding !== identity.binding) {
        return Promise.resolve(undefined);
      }

      if (record.phase === 'admitted' && !identity.nativeDispatched) {
        release({ kind: 'not-dispatched' });
      }

      const settlement = record.settlement;
      if (settlement?.kind === 'not-dispatched') {
        return Promise.resolve(
          identity.nativeDispatched
            ? undefined
            : { process: 'stopped', outcome: 'interrupted', source: 'not-dispatched' },
        );
      }

      return Promise.resolve(
        settlement?.kind === 'native-result'
          ? { process: 'stopped', outcome: settlement.outcome, source: 'native-result' }
          : undefined,
      );
    },
    settleStopped(identity) {
      counts.settleStopped++;
      if (record?.binding !== identity.binding) {
        return refuse();
      }

      if (record.phase === 'settled') {
        return record.settlement?.kind === 'native-result' &&
          record.settlement.outcome === 'interrupted'
          ? Promise.resolve()
          : refuse();
      }

      if (record.phase === 'admitted') {
        return refuse();
      }

      release({ kind: 'native-result', outcome: 'interrupted' });

      return Promise.resolve();
    },
  };

  return {
    effects,
    counts,
    phase: () => record?.phase,
    settlement: () => record?.settlement,
    hangDispatch() {
      hangDispatch = true;
    },
    /** What `settleStopped` committed before a crash cut the Turn's own settlement. */
    settledStoppedBeforeCrash() {
      release({ kind: 'native-result', outcome: 'interrupted' });
    },
  };
}

/**
 * Where the driver stops for good (the Runtime crashes there): during installation discovery,
 * after spawning without recording its process, after recording it, after the claim's dispatch
 * mark (before the dispatch barrier), or after native input was dispatched.
 */
type Window = 'discovery' | 'spawned' | 'recorded' | 'claim-dispatched' | 'input-dispatched';

async function crashFixture(window: Window, agent?: NativeProcessIdentity) {
  const root = await mkdtemp(join(tmpdir(), 'native-stop-recovery-'));
  cleanups.push(() => rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 }));
  const journal = claimJournal();
  if (window === 'recorded') {
    journal.hangDispatch();
  }

  let reached: () => void = () => undefined;
  const crashPoint = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const hang = () => {
    reached();

    return new Promise<void>(() => undefined);
  };

  const start = (invocation: Invocation) => {
    const done = (async () => {
      if (window === 'discovery' || window === 'spawned') {
        return hang();
      }

      const recording = invocation.recordProcess!(agent!);
      if (window === 'recorded') {
        // The identity commit precedes the (hanging) claim dispatch mark.
        void recording;
        await new Promise((resolve) => setTimeout(resolve, 200));

        return hang();
      }

      await recording;
      if (window === 'claim-dispatched') {
        return hang();
      }

      await invocation.beforeDispatch!();

      return hang();
    })();

    return { done, respond: () => Promise.resolve({ deliveredKeys: [] }) };
  };

  const driver: SessionDriver = {
    ...createMockDriver(),
    supportsManagedWrites: true,
    describe: () => ({
      ...createMockDriver().describe(),
      providerId: 'controlled',
      modes: ['read-only', 'workspace-write'],
    }),
    validate: () => undefined,
    contextScope: () => 'account',
    start,
  };
  const context = {
    kind: 'read-only' as const,
    workspace: root,
    temporaryRoot: root,
    workspaceIdentity: '1'.repeat(64),
  };
  let store: SessionStore = await openSessionStore({ directory: root, projectId: 'project' });
  let runtime: SessionCoordinator = createSessionCoordinator(
    store,
    driver,
    'project',
    true,
    context,
    journal.effects,
  );
  cleanups.push(() => runtime.close().catch(() => undefined));
  const { sessionId } = await runtime.create('actor', {
    requestId: randomUUID(),
    providerId: 'controlled',
    mode: 'workspace-write',
    providerModeId: 'acceptEdits',
  });
  const { turnId } = await runtime.start('actor', sessionId, {
    requestId: randomUUID(),
    message: 'Write',
  });
  await crashPoint;

  // The Runtime dies: no shutdown settlement, and its owner row names a process that is gone.
  await store.abandon();
  const db = new DatabaseSync(join(root, 'sessions.sqlite'));
  db.exec("UPDATE owner SET runtime='',pid=0 WHERE id=1");
  db.close();
  store = await openSessionStore({ directory: root, projectId: 'project' });
  runtime = createSessionCoordinator(store, driver, 'project', true, context, journal.effects);

  const turn = async () => {
    const snapshot = await runtime.snapshot(sessionId, 'actor');

    return {
      state: snapshot.activeTurn?.state ?? 'terminal',
      outcomes: snapshot.entries.filter((entry) => entry.kind === 'outcome'),
    };
  };

  return {
    journal,
    turn,
    recover: () => runtime.recoverEffects(),
    check: () => runtime.reconcile('actor', sessionId, turnId, randomUUID()),
  };
}

describe('crash windows of a write Turn', () => {
  it.each(['discovery', 'spawned'] as const)(
    'retires a claim never dispatched on startup: crash at %s',
    async (window) => {
      // `spawned`: a process exists but its identity was never recorded, so it never got input.
      const agent = window === 'spawned' ? await agentProcess() : undefined;
      const f = await crashFixture(window, agent?.identity);
      expect(f.journal.phase()).toBe('admitted');
      await f.recover();
      expect(await f.turn()).toMatchObject({
        state: 'terminal',
        outcomes: [{ text: { text: 'interrupted' } }],
      });
      expect(f.journal.settlement()).toEqual({ kind: 'not-dispatched' });
      expect(f.journal.counts.released).toBe(1);
    },
    30000,
  );

  it('keeps a claim held while the recorded process of an undispatched claim may run', async () => {
    const agent = await agentProcess();
    const f = await crashFixture('recorded', agent.identity);
    await f.recover();
    expect((await f.turn()).state).toBe('unknown');
    expect(f.journal.phase()).toBe('admitted');
    await expect(f.check()).rejects.toMatchObject({ code: 'SESSION_RECOVERY_REQUIRED' });
    expect(f.journal.phase()).toBe('admitted');

    await agent.stop();
    await expect(f.check()).resolves.toMatchObject({ outcome: 'interrupted' });
    expect(f.journal.settlement()).toEqual({ kind: 'not-dispatched' });
    expect(f.journal.counts.released).toBe(1);
  }, 30000);

  it.each(['claim-dispatched', 'input-dispatched'] as const)(
    'settles on native-stop evidence once the recorded process stopped: crash at %s',
    async (window) => {
      const agent = await agentProcess();
      const f = await crashFixture(window, agent.identity);
      expect(f.journal.phase()).toBe('dispatched');
      await f.recover();
      expect((await f.turn()).state).toBe('unknown');
      expect(f.journal.phase()).toBe('dispatched');

      await agent.stop();
      await f.recover();
      const turn = await f.turn();
      expect(turn.state).toBe('terminal');
      expect(turn.outcomes).toHaveLength(1);
      expect(turn.outcomes[0]).toMatchObject({
        text: { text: 'interrupted' },
        error: { code: 'PROCESS_STOPPED' },
      });
      expect(f.journal.settlement()).toEqual({ kind: 'native-result', outcome: 'interrupted' });

      // Startup recovery and Check outcome again: one settlement, one claim release.
      await f.recover();
      await expect(f.check()).rejects.toMatchObject({ code: 'SESSION_RECOVERY_REQUIRED' });
      await f.recover();
      expect((await f.turn()).outcomes).toHaveLength(1);
      expect(f.journal.counts.released).toBe(1);
      expect(f.journal.counts.settleStopped).toBe(1);
    },
    30000,
  );

  it('finishes a native-stop settlement whose claim settled before a crash as PROCESS_STOPPED', async () => {
    const agent = await agentProcess();
    const f = await crashFixture('input-dispatched', agent.identity);
    await agent.stop();
    // The claim settled on native-stop evidence, then the Runtime died before the Turn did.
    f.journal.settledStoppedBeforeCrash();
    await f.recover();
    const turn = await f.turn();
    expect(turn.outcomes).toHaveLength(1);
    expect(turn.outcomes[0]).toMatchObject({ error: { code: 'PROCESS_STOPPED' } });
    expect(f.journal.counts.released).toBe(1);
    expect(f.journal.counts.settleStopped).toBe(0);
  }, 30000);

  it('keeps the claim held when the OS cannot establish whether the process stopped', async () => {
    // An identity of the other platform family is never evidence on this OS.
    const ambiguous: NativeProcessIdentity =
      process.platform === 'win32'
        ? { platform: 'posix', groupId: 4242 }
        : {
            platform: 'windows',
            pid: 4242,
            createdAt: '1',
            job: 'Local\\NevoSession-' + randomUUID(),
          };
    const f = await crashFixture('input-dispatched', ambiguous);
    await f.recover();
    await expect(f.check()).rejects.toMatchObject({
      code: 'SESSION_RECOVERY_REQUIRED',
      message: expect.stringContaining('cannot be established') as string,
    });
    expect((await f.turn()).state).toBe('unknown');
    expect(f.journal.phase()).toBe('dispatched');
    expect(f.journal.counts.released).toBe(0);
  }, 30000);

  it.runIf(process.platform === 'win32')(
    'keeps the claim held while a descendant still runs in the job after its root exited',
    async () => {
      // A named job without kill-on-close stands in for the Runtime's: the root is outside it,
      // the descendant inside, as after a bootstrap exit with a provider child still running.
      const { kernel } = windowsKernel();
      const createJob = kernel.func('void * __stdcall CreateJobObjectW(void *, const char16_t *)');
      const openProcess = kernel.func('void * __stdcall OpenProcess(uint32_t, int, uint32_t)');
      const assign = kernel.func('int __stdcall AssignProcessToJobObject(void *, void *)');
      const close = kernel.func('int __stdcall CloseHandle(void *)');
      const name = 'Local\\NevoSession-' + randomUUID();
      const job = createJob(null, name) as bigint;
      cleanups.push(() => void close(job));
      const root = await agentProcess(name);
      const descendant = await agentProcess();
      const handle = openProcess(0x0101, 0, descendant.pid) as bigint; // SET_QUOTA | TERMINATE
      expect(assign(job, handle)).toBeTruthy();
      close(handle);
      await root.stop();

      const f = await crashFixture('input-dispatched', root.identity);
      await f.recover();
      await expect(f.check()).rejects.toMatchObject({
        message: expect.stringContaining('still running') as string,
      });
      expect(f.journal.phase()).toBe('dispatched');

      await descendant.stop();
      await expect(f.check()).resolves.toMatchObject({ outcome: 'interrupted' });
      expect(f.journal.counts.released).toBe(1);
    },
    30000,
  );
});
