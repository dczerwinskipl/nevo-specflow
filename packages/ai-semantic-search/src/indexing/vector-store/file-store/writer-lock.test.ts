import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  inspectWriterLock,
  tryAcquireWriterLock,
  type WriterLockAttempt,
  type WriterLockDependencies,
} from './writer-lock';

let scratch: string;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'ai-semantic-lock-'));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

/** Contenders see the lock ten minutes after it was written, so a lock nobody refreshes is stale. */
const contender = (
  pid: number,
  checkpoint?: WriterLockDependencies['checkpoint'],
): WriterLockDependencies => ({
  pid,
  scope: 'test',
  isProcessAlive: () => true,
  now: () => Date.now() + 600_000,
  staleAfterMs: 60_000,
  ...(checkpoint ? { checkpoint } : {}),
});

/** A lock whose holder stopped refreshing it (a suspended or hung writer): its process looks alive. */
async function abandonedLock(): Promise<WriterLockAttempt> {
  const attempt = await tryAcquireWriterLock(scratch, 'abandoned', {
    ...contender(100),
    now: Date.now,
  });
  expect(attempt.status).toBe('acquired');

  return attempt;
}

function gate(): { readonly open: () => void; readonly opened: Promise<void> } {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });

  return { open, opened };
}

async function release(...attempts: WriterLockAttempt[]): Promise<void> {
  for (const attempt of attempts) {
    if (attempt.status === 'acquired') {
      await attempt.release();
    }
  }
}

describe('tryAcquireWriterLock', () => {
  it('lets exactly one of two writers that found the same stale lock take it over', async () => {
    const abandoned = await abandonedLock();
    const reached = [gate(), gate()];
    const go = [gate(), gate()];
    const attempt = (index: number) =>
      tryAcquireWriterLock(
        scratch,
        `writer-${String(index)}`,
        contender(101 + index, async (step) => {
          if (step === 'claim') {
            reached[index]!.open();
            await go[index]!.opened;
          }
        }),
      );

    const first = attempt(0);
    const second = attempt(1);
    // Both judged the lock stale before either claims it.
    await Promise.all(reached.map((step) => step.opened));
    go[0]!.open();
    const won = await first;
    go[1]!.open();
    const lost = await second;

    expect([won.status, lost.status]).toEqual(['acquired', 'busy']);
    // The former holder's release leaves the new owner's lock in place.
    const observer = { ...contender(103), now: Date.now };
    await release(abandoned);
    expect(await inspectWriterLock(scratch, observer)).toEqual({ status: 'held', pid: 101 });
    await release(won);
    expect(await inspectWriterLock(scratch, observer)).toEqual({ status: 'free' });
  });

  it('lets exactly one of two processes that found the same stale lock take it over', async () => {
    const abandoned = await abandonedLock();
    const script = join(scratch, 'contend.mjs');
    await writeFile(script, CONTENDER_SCRIPT);
    const lockModule = pathToFileURL(fileURLToPath(new URL('./writer-lock.ts', import.meta.url)));
    const contenders = [0, 1].map(() =>
      inbox(
        spawn(
          process.execPath,
          ['--disable-warning=ExperimentalWarning', script, lockModule.href, scratch],
          { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
        ),
      ),
    );

    try {
      // Both processes judged the lock stale and wait before claiming it.
      expect(await Promise.all(contenders.map((child) => child.next()))).toEqual([
        'claiming',
        'claiming',
      ]);
      contenders[0]!.child.send('claim');
      const won = await contenders[0]!.next();
      contenders[1]!.child.send('claim');
      const lost = await contenders[1]!.next();

      expect([won, lost]).toEqual(['acquired', 'busy']);
    } finally {
      for (const { child } of contenders) {
        child.kill();
      }

      await Promise.all(contenders.map(({ exited }) => exited));
      await release(abandoned);
    }
  });
});

/** Messages of a child process in arrival order; a child that exits early fails with its stderr. */
function inbox(child: ChildProcess) {
  const messages: unknown[] = [];
  const waiting: ((message: unknown) => void)[] = [];
  let stderr = '';
  child.stderr?.on('data', (data: Buffer) => {
    stderr += data.toString();
  });
  child.on('message', (message) => {
    const waiter = waiting.shift();
    if (waiter) {
      waiter(message);
    } else {
      messages.push(message);
    }
  });
  const exited = new Promise<void>((resolve) => {
    child.once('exit', () => {
      for (const waiter of waiting.splice(0)) {
        waiter(`exited: ${stderr}`);
      }

      resolve();
    });
  });

  return {
    child,
    exited,
    next: () =>
      messages.length > 0
        ? Promise.resolve(messages.shift())
        : new Promise<unknown>((resolve) => waiting.push(resolve)),
  };
}

/**
 * A contender process: takes the lock with the same dependencies as `contender`, reports
 * `claiming` at the claim step and waits for `claim`, reports its outcome and holds the lock until it
 * is killed. Node runs the TypeScript sources itself (type stripping); the resolve hook adds the
 * `.ts` extension the sources leave out of their relative imports.
 */
const CONTENDER_SCRIPT = `
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.')) {
        return nextResolve(specifier + '.ts', context);
      }
      throw error;
    }
  },
});

const messages = [];
const waiting = [];
process.on('message', (message) => {
  const waiter = waiting.shift();
  if (waiter) waiter(message); else messages.push(message);
});
const next = () =>
  messages.length > 0 ? Promise.resolve(messages.shift()) : new Promise((resolve) => waiting.push(resolve));

const [moduleUrl, directory] = process.argv.slice(2);
const { tryAcquireWriterLock } = await import(moduleUrl);
const attempt = await tryAcquireWriterLock(directory, 'process-' + process.pid, {
  pid: process.pid,
  scope: 'test',
  isProcessAlive: () => true,
  now: () => Date.now() + 600_000,
  staleAfterMs: 60_000,
  checkpoint: async (step) => {
    if (step === 'claim') {
      process.send('claiming');
      await next();
    }
  },
});
process.send(attempt.status);
await next();
`;
