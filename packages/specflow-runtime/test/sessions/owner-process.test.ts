import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openSessionStore, type SessionStore } from '../../src/features/sessions/persistence/store';
import type {
  SnapshotSource,
  StartAdmission,
} from '../../src/features/sessions/persistence/protocol';
interface ChildAdmission {
  sessionId: string;
  admission: StartAdmission;
  input: { requestId: string; message: string };
}

it.each(['mock', 'undispatched', 'confirmed', 'uncertain'] as const)(
  'reconciles %s evidence after SIGKILL without repeating native input',
  async (scenario) => {
    const directory = await mkdtemp(join(tmpdir(), 'nevo-session-owner-'));
    const entry = new URL('../../src/session-worker.ts', import.meta.url).href;
    const source = `
    import { Worker } from 'node:worker_threads';
    import { randomUUID } from 'node:crypto';
    const scenario = ${JSON.stringify(scenario)};
    const directory = ${JSON.stringify(directory)};
    const worker = new Worker(new URL(${JSON.stringify(entry)}), {
      execArgv: [],
      workerData: { kind: 'session-store', directory, projectId: 'project', runtimeId: randomUUID(), pid: process.pid },
    });
    let sessionId;
    let admission;
    const input = { requestId: randomUUID(), message: 'running' };
    const ready = () => process.stdout.write(JSON.stringify({ sessionId, admission, input }) + '\\n');
    const send = (id, command) => worker.postMessage({ id, command });
    worker.on('message', (message) => {
      if (message.error) throw new Error(JSON.stringify(message.error));
      if (message.id === 0) send(1, {
        op: 'create', actor: 'actor',
        input: { requestId: randomUUID(), providerId: scenario === 'mock' ? 'mock' : 'claude', mode: 'read-only' },
      });
      if (message.id === 1) {
        sessionId = message.result.sessionId;
        send(2, { op: 'start', actor: 'actor', sessionId, input,
          ...(scenario === 'mock' ? {} : { nativeWorkspace: directory, nativeScope: 'account-a' }),
        });
      }
      if (message.id === 2) {
        admission = message.result;
        if (scenario === 'mock' || scenario === 'undispatched') ready();
        else send(3, { op: 'dispatch-intent', sessionId, turnId: admission.turnId, invocationId: admission.invocationId });
      }
      if (message.id === 3) {
        if (scenario === 'uncertain') ready();
        else send(4, { op: 'fact', sessionId, turnId: admission.turnId, invocationId: admission.invocationId,
          driverSeq: 1, fact: { kind: 'correlation', providerSessionId: admission.providerContext.nativeSessionId },
        });
      }
      if (message.id === 4) ready();
    });
  `;
    const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let store: SessionStore | undefined;
    try {
      const ready = await new Promise<ChildAdmission>((resolve, reject) => {
        let output = '',
          diagnostic = '';
        child.stdout.on('data', (chunk) => {
          output += String(chunk);
          if (output.includes('\n')) resolve(JSON.parse(output.trim()) as ChildAdmission);
        });
        child.stderr.on('data', (chunk) => {
          diagnostic = (diagnostic + String(chunk)).slice(-8192);
        });
        child.on('error', reject);
        child.on('exit', (code) => {
          if (code) reject(new Error('Child failed: ' + code + ' ' + diagnostic));
        });
      });
      await expect(openSessionStore({ directory, projectId: 'project' })).rejects.toMatchObject({
        code: 'SESSION_STORE_BUSY',
      });
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited;
      store = await openSessionStore({ directory, projectId: 'project' });
      const snapshot = (
        await store.call<SnapshotSource>({
          op: 'snapshot',
          sessionId: ready.sessionId,
          actor: 'actor',
        })
      ).snapshot;
      expect(
        await store.call({
          op: 'start',
          actor: 'actor',
          sessionId: ready.sessionId,
          input: ready.input,
        }),
      ).toMatchObject({ turnId: ready.admission.turnId, fresh: false });
      if (scenario === 'mock' || scenario === 'undispatched') {
        expect(snapshot.activeTurn).toBeUndefined();
        expect(snapshot.entries.at(-1)?.text.text).toBe('interrupted');
      } else {
        expect(snapshot.activeTurn?.state).toBe('unknown');
        expect(snapshot.entries.some((item) => item.kind === 'outcome')).toBe(false);
        await expect(
          store.call({
            op: 'cancel',
            actor: 'actor',
            sessionId: ready.sessionId,
            turnId: ready.admission.turnId,
            requestId: crypto.randomUUID(),
          }),
        ).rejects.toMatchObject({ code: 'SESSION_RECOVERY_REQUIRED' });
      }
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit');
        child.kill();
        await exited;
      }
      await store?.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
  15000,
);
