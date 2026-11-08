import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DriverFact } from '../../persistence/protocol';
import type { Invocation } from '../driver';
import { createAntigravityOperation, type AntigravityProcess } from './operation';
import { createAntigravityQuestionBridge } from './question-bridge';
import { runAntigravityHook } from './hook-client';

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

// The real operation and authenticated bridge share a controllable native stream.
// EOF request, native exit and idle receipt are separate barriers.
async function fixture() {
  const workspace = await realpath(await mkdtemp(join(tmpdir(), 'specflow-stop-settlement-')));
  cleanups.push(() => rm(workspace, { recursive: true, force: true }));
  const controller = new AbortController();
  const facts: DriverFact[] = [];
  const invocation: Invocation = {
    sessionId: randomUUID(),
    turnId: randomUUID(),
    invocationId: randomUUID(),
    request: { requestId: randomUUID(), message: 'Controlled protocol fixture' },
    selection: {
      providerId: 'antigravity',
      mode: 'workspace-write',
      providerModeId: 'accept-edits',
    },
    executionContext: {
      kind: 'workspace-write',
      workspace,
      temporaryRoot: workspace,
      workspaceIdentity: 'fixture-workspace',
      admission: { operationId: randomUUID(), scope: 'project' },
    },
    providerContext: { nativeSessionId: 'fixture-native', resume: false },
    beforeDispatch: vi.fn(() => Promise.resolve()),
  };
  const nativeTools = ['run_command', 'view_file'];
  const bridge = await createAntigravityQuestionBridge({
    invocation,
    signal: controller.signal,
    emit: (fact) => {
      facts.push(fact);

      return Promise.resolve();
    },
    permissionContext: () => ({
      nativeSessionId: 'fixture-native',
      workspace,
      nativeTools,
      writable: true,
      commandsAllowed: true,
    }),
  });
  const configurationPath = join(workspace, 'private-fixture.json');
  await writeFile(configurationPath, JSON.stringify(bridge.nativeHookClientConfiguration));
  const frames: string[] = [];
  let wake: (() => void) | undefined;
  let ended = false;
  let naturalExit = false;
  const exited = Promise.withResolvers<{ code: number; signal: null }>();
  const input = Promise.withResolvers<void>();
  const eof = Promise.withResolvers<void>();
  const owner: AntigravityProcess = {
    done: exited.promise,
    write: vi.fn(() => {
      input.resolve();

      return Promise.resolve();
    }),
    endInput: vi.fn(() => {
      eof.resolve();

      return Promise.resolve();
    }),
    async *lines() {
      while (!ended || frames.length) {
        if (!frames.length) {
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }

        wake = undefined;
        const frame = frames.shift();
        if (frame !== undefined) {
          yield frame;
        }
      }
    },
    dispose: vi.fn<AntigravityProcess['dispose']>(() => {
      ended = true;
      wake?.();
      exited.resolve({ code: 0, signal: null });

      return Promise.resolve({
        process: { state: 'stopped', reason: naturalExit ? 'group-exited' : 'tree-killed' },
        cleanup: [],
      });
    }),
  };
  const operation = createAntigravityOperation(
    invocation,
    (fact) => {
      facts.push(fact);

      return Promise.resolve();
    },
    controller.signal,
    {
      launch: () => Promise.resolve({ owner, interactions: bridge }),
      beforeInput: () => Promise.resolve(),
    },
  );
  cleanups.push(async () => {
    controller.abort();
    await operation.done;
  });
  const push = (frame: object) => {
    frames.push(JSON.stringify(frame));
    wake?.();
  };

  push({
    event: 'init',
    conversation_id: 'fixture-native',
    init: { cwd: workspace, tools: nativeTools, permission_mode: 'strict' },
  });
  await input.promise;
  const hook = (role: 'pre-tool-use' | 'stop', body: object) =>
    runAntigravityHook({
      hook: role,
      configurationPath,
      signal: controller.signal,
      input: Buffer.from(
        JSON.stringify({ conversationId: 'fixture-native', workspacePaths: [workspace], ...body }),
      ),
    });
  const stop = (executionNum: number, fullyIdle = true) =>
    hook('stop', { executionNum, fullyIdle, terminationReason: 'NO_TOOL_CALL' });
  const permission = () =>
    hook('pre-tool-use', {
      stepIdx: 0,
      toolCall: {
        name: 'run_command',
        args: {
          CommandLine: 'echo controlled fixture',
          Cwd: workspace,
          WaitMsBeforeAsync: 1,
          toolSummary: 'Controlled fixture',
          toolAction: 'execute',
        },
      },
    });
  const result = () =>
    push({
      event: 'result',
      result: {
        conversation_id: 'fixture-native',
        status: 'SUCCESS',
        response: 'Final continued answer',
      },
    });
  const exit = () => {
    naturalExit = true;
    ended = true;
    wake?.();
    exited.resolve({ code: 0, signal: null });
  };

  return {
    invocation,
    controller,
    facts,
    owner,
    operation,
    bridge,
    push,
    stop,
    permission,
    result,
    exit,
    eof: eof.promise,
  };
}

it('settles only the final continued execution with one dispatch and one user frame', async () => {
  const f = await fixture();
  const pending = f.permission();
  await vi.waitFor(() => expect(f.facts.some((fact) => fact.kind === 'interaction')).toBe(true));
  const interaction = f.facts.find((fact) => fact.kind === 'interaction')!;
  await expect(f.stop(0)).resolves.toEqual({ decision: 'continue' });
  expect(f.facts.some((fact) => fact.kind === 'outcome')).toBe(false);
  await f.operation.respond(interaction.key, {
    requestId: randomUUID(),
    kind: 'permission',
    decision: 'deny',
  });
  await expect(pending).resolves.toEqual({ decision: 'deny' });
  f.push({
    event: 'step_update',
    step_update: {
      conversation_id: 'fixture-native',
      step_index: 1,
      step_type: 'agent_response',
      state: 'DONE',
      text_delta: 'Final continued answer',
    },
  });
  await expect(f.stop(1)).resolves.toEqual({ decision: 'stop' });
  f.result();
  await f.eof;
  expect(f.facts.some((fact) => fact.kind === 'outcome')).toBe(false);
  // Shutdown diagnostics are drained, not interpreted as a second Turn.
  f.push({ event: 'diagnostic', value: 'native shutdown' });
  f.exit();
  await f.operation.done;
  expect(await f.operation.settlement).toMatchObject({
    source: 'native-result',
    result: { outcome: 'completed' },
  });
  expect(f.facts.filter((fact) => fact.kind === 'outcome')).toHaveLength(1);
  expect(f.invocation.beforeDispatch).toHaveBeenCalledOnce();
  expect(f.owner.write).toHaveBeenCalledOnce();
});

it('does not continue a pending interaction after the terminal result barrier', async () => {
  const f = await fixture();
  const pending = f.permission();
  await vi.waitFor(() => expect(f.facts.some((fact) => fact.kind === 'interaction')).toBe(true));
  f.result();
  await f.eof;
  await expect(f.stop(0)).resolves.toEqual({ decision: 'stop' });
  f.controller.abort('user-cancel');
  await pending;
  await f.operation.done;
  expect(await f.operation.settlement).toMatchObject({ source: 'forced-stop' });
  expect(f.facts.some((fact) => fact.kind === 'outcome')).toBe(false);
  expect(f.owner.write).toHaveBeenCalledOnce();
});

it.each(['missing-idle', 'cancel', 'process-loss'] as const)(
  'keeps a continued execution unknown on %s',
  async (failure) => {
    const f = await fixture();
    if (failure === 'missing-idle') {
      await expect(f.stop(0, false)).resolves.toEqual({ decision: 'stop' });
    }

    const pending = f.permission();
    await vi.waitFor(() => expect(f.facts.some((fact) => fact.kind === 'interaction')).toBe(true));
    const interaction = f.facts.find((fact) => fact.kind === 'interaction')!;
    await expect(f.stop(0)).resolves.toEqual({ decision: 'continue' });
    await f.operation.respond(interaction.key, {
      requestId: randomUUID(),
      kind: 'permission',
      decision: 'deny',
    });
    await pending;
    if (failure === 'process-loss') {
      f.exit();
    } else {
      if (failure === 'missing-idle') {
        vi.useFakeTimers();
      }

      f.result();
      await f.eof;
      await expect(f.stop(0)).resolves.toEqual({ decision: 'deny' });
      if (failure === 'cancel') {
        f.controller.abort('user-cancel');
      } else {
        // A native exit cannot substitute for the missing later idle receipt.
        f.exit();
        await vi.advanceTimersByTimeAsync(5000);
      }
    }

    await f.operation.done;
    expect(f.facts.some((fact) => fact.kind === 'outcome')).toBe(false);
    expect(f.facts.at(-1)).toMatchObject({ kind: 'lost' });
    expect(f.owner.write).toHaveBeenCalledOnce();
  },
);

it('settles legitimate same-execution background completion after a newer interaction is resolved', async () => {
  const f = await fixture();
  await expect(f.stop(0, false)).resolves.toEqual({ decision: 'stop' });
  const pending = f.permission();
  await vi.waitFor(() => expect(f.facts.some((fact) => fact.kind === 'interaction')).toBe(true));
  const interaction = f.facts.find((fact) => fact.kind === 'interaction')!;
  await f.operation.respond(interaction.key, {
    requestId: randomUUID(),
    kind: 'permission',
    decision: 'deny',
  });
  await expect(pending).resolves.toEqual({ decision: 'deny' });
  await expect(f.stop(0)).resolves.toEqual({ decision: 'stop' });
  f.result();
  await f.eof;
  f.exit();
  await f.operation.done;
  expect(await f.operation.settlement).toMatchObject({
    source: 'native-result',
    result: { outcome: 'completed' },
  });
  expect(f.facts.filter((fact) => fact.kind === 'outcome')).toHaveLength(1);
  expect(f.owner.write).toHaveBeenCalledOnce();
});
