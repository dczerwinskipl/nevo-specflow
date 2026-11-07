import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it, vi } from 'vitest';
import type { SessionChange, TelemetrySnapshot } from '@nevo/specflow-contracts/sessions';
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

it.each(['mock', 'undispatched', 'confirmed', 'uncertain', 'telemetry'] as const)(
  'reconciles %s evidence after SIGKILL without repeating native input',
  async (scenario) => {
    const directory = await mkdtemp(join(tmpdir(), 'nevo-session-owner-'));
    const entry = new URL('../../src/session-worker.ts', import.meta.url).href;
    // Exit the Worker on the committed sample's reply, before its event loop
    // can execute the publication timer. The parent still owns the store.
    const exitAfterSample = `
      import { parentPort } from 'node:worker_threads';
      const post = parentPort.postMessage.bind(parentPort);
      parentPort.postMessage = (message) => {
        post(message);
        if (message.id === 5 && !message.error) process.exit(0);
      };
      await import(${JSON.stringify(entry)});
    `;
    const workerEntry =
      scenario === 'telemetry'
        ? 'data:text/javascript,' + encodeURIComponent(exitAfterSample)
        : entry;
    const source = `
    import { Worker } from 'node:worker_threads';
    import { randomUUID } from 'node:crypto';
    const scenario = ${JSON.stringify(scenario)};
    const directory = ${JSON.stringify(directory)};
    const worker = new Worker(new URL(${JSON.stringify(workerEntry)}), {
      execArgv: [],
      workerData: { kind: 'session-store', directory, projectId: 'project', runtimeId: randomUUID(), pid: process.pid },
    });
    let sessionId;
    let admission;
    const input = { requestId: randomUUID(), message: 'running' };
    if (scenario === 'telemetry') setInterval(() => {}, 1000);
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
      if (message.id === 4) {
        if (scenario !== 'telemetry') ready();
        else send(5, { op: 'fact', sessionId, turnId: admission.turnId, invocationId: admission.invocationId,
          driverSeq: 2, fact: { kind: 'usage', sampleId: 'pending-publication', basis: 'turn-total', counters: { inputTokens: 19 } },
        });
      }
      if (message.id === 5) ready();
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
          if (output.includes('\n')) {
            resolve(JSON.parse(output.trim()) as ChildAdmission);
          }
        });
        child.stderr.on('data', (chunk) => {
          diagnostic = (diagnostic + String(chunk)).slice(-8192);
        });
        child.on('error', reject);
        child.on('exit', (code) => {
          if (code) {
            reject(new Error('Child failed: ' + code + ' ' + diagnostic));
          }
        });
      });
      await expect(openSessionStore({ directory, projectId: 'project' })).rejects.toMatchObject({
        code: 'SESSION_STORE_BUSY',
      });
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited;
      let beforeRecovery = 0;
      if (scenario === 'telemetry') {
        const db = new DatabaseSync(join(directory, 'sessions.sqlite'), { readOnly: true });
        try {
          expect(db.prepare('SELECT session FROM telemetry_publications').all()).toEqual([
            { session: ready.sessionId },
          ]);
          beforeRecovery = Number(
            db.prepare('SELECT seq FROM sessions WHERE id=?').get(ready.sessionId)?.seq,
          );
          expect(beforeRecovery).toBeGreaterThan(0);
        } finally {
          db.close();
        }
      }

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

      if (scenario === 'telemetry') {
        const telemetry = await store.call<TelemetrySnapshot>({
          op: 'telemetry',
          sessionId: ready.sessionId,
        });
        expect(telemetry.usage.session).toMatchObject({ value: { inputTokens: 19 } });
        await vi.waitFor(
          async () => {
            const replay = await store!.call<{ events: SessionChange[] }>({
              op: 'events',
              sessionId: ready.sessionId,
              after: beforeRecovery,
            });
            const publications = replay.events.filter((event) => event.kind === 'telemetry');
            expect(publications).toHaveLength(1);
            expect(publications.at(-1)).toMatchObject({
              changes: { telemetryRevision: telemetry.revision },
            });
          },
          { timeout: 3000 },
        );
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
