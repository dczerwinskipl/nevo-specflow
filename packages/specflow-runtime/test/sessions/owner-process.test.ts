import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openSessionStore, type SessionStore } from '../../src/features/sessions/persistence/store';
import type { SnapshotSource } from '../../src/features/sessions/persistence/protocol';

it('refuses a live process then recovers its orphaned Turn only after process death', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nevo-session-owner-'));
  const entry = new URL('../../src/session-worker.ts', import.meta.url).href;
  const source = `import {Worker} from 'node:worker_threads'; import {randomUUID} from 'node:crypto';
    const worker=new Worker(new URL(${JSON.stringify(entry)}),{execArgv:[],workerData:{kind:'session-store',directory:${JSON.stringify(directory)},projectId:'project',runtimeId:randomUUID(),pid:process.pid}});
    let sessionId;
    worker.on('message',m=>{if(m.error)throw Error(JSON.stringify(m.error));
      if(m.id===0)worker.postMessage({id:1,command:{op:'create',actor:'actor',input:{requestId:randomUUID(),providerId:'mock',mode:'read-only'}}});
      if(m.id===1){sessionId=m.result.sessionId;worker.postMessage({id:2,command:{op:'start',actor:'actor',sessionId,input:{requestId:randomUUID(),message:'running'}}});}
      if(m.id===2)process.stdout.write(JSON.stringify({sessionId})+'\\n');
    });`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let store: SessionStore | undefined;
  try {
    const ready = await new Promise<{ sessionId: string }>((resolve, reject) => {
      let output = '',
        diagnostic = '';
      child.stdout.on('data', (chunk) => {
        output += String(chunk);
        if (output.includes('\n')) resolve(JSON.parse(output.trim()) as { sessionId: string });
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
    child.kill('SIGTERM');
    await exited;
    store = await openSessionStore({ directory, projectId: 'project' });
    const snapshot = (
      await store.call<SnapshotSource>({
        op: 'snapshot',
        sessionId: ready.sessionId,
        actor: 'actor',
      })
    ).snapshot;
    expect(snapshot.activeTurn).toBeUndefined();
    expect(snapshot.entries.at(-1)?.text.text).toBe('interrupted');
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
    await store?.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 15000);
