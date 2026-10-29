import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import type { DriverFact } from '../../persistence/protocol';
import type { Invocation } from '../driver';
import { disabledCodexFeatures } from './installation';
import { createCodexOperation } from './operation';

function fixture(
  options: {
    unknown?: boolean;
    persistFails?: boolean;
    beforeInputFails?: boolean;
    replyFails?: boolean;
    homeMismatch?: boolean;
    resume?: boolean;
  } = {},
) {
  const workspace = resolve('codex-owned-workspace');
  const facts: DriverFact[] = [];
  const sent: { id?: number | string; method?: string; params?: Record<string, unknown> }[] = [];
  const incoming: string[] = [];
  let ended = false;
  let wake: (() => void) | undefined;
  const push = (frame: unknown) => {
    incoming.push(JSON.stringify(frame));
    wake?.();
  };

  const abort = new AbortController();
  const beforeDispatch = vi.fn(() => {
    expect(facts).toContainEqual({ kind: 'correlation', providerSessionId: 'native-thread' });

    return Promise.resolve();
  });
  const invocation: Invocation = {
    sessionId: randomUUID(),
    turnId: randomUUID(),
    invocationId: randomUUID(),
    request: { requestId: randomUUID(), message: 'Literal @file /command' },
    selection: {
      providerId: 'codex',
      mode: 'workspace-write',
      providerModeId: 'default',
      effort: 'low',
    },
    executionContext: { kind: 'no-effects' },
    providerContext: {
      nativeSessionId: options.resume ? 'native-thread' : 'reservation',
      resume: options.resume === true,
    },
    beforeDispatch,
  };
  const operation = createCodexOperation(
    invocation,
    (fact) => {
      if (fact.kind === 'outcome' && options.persistFails) {
        throw new Error('store unavailable');
      }

      facts.push(fact);

      return Promise.resolve();
    },
    abort.signal,
    {
      workspace,
      home: () => resolve('private-home'),
      beforeInput() {
        if (options.beforeInputFails) {
          throw new Error('changed installation');
        }

        return Promise.resolve();
      },
      launch() {
        return Promise.resolve({
          write(line: string) {
            const frame = JSON.parse(line) as (typeof sent)[number];
            if (!frame.method && options.replyFails) {
              throw new Error('stdin failed');
            }

            sent.push(frame);
            const responses: Record<string, unknown> = {
              initialize: {
                userAgent: 'controlled-codex',
                codexHome: resolve(options.homeMismatch ? 'original-cli-home' : 'private-home'),
              },
              'configRequirements/read': { requirements: null },
              'experimentalFeature/list': {
                data: [
                  ...disabledCodexFeatures.map((name) => ({ name, enabled: false })),
                  { name: 'code_mode_host', enabled: true },
                ],
              },
              'mcpServerStatus/list': { data: [] },
              'account/read': { account: { type: 'chatgpt' } },
              'model/list': {
                data: [
                  {
                    model: 'controlled-model',
                    displayName: 'Controlled',
                    supportedReasoningEfforts: [{ reasoningEffort: 'low' }],
                  },
                ],
              },
              'thread/start': {
                model: 'controlled-model',
                cwd: workspace,
                approvalPolicy: 'on-request',
                approvalsReviewer: 'user',
                sandbox: {
                  type: 'workspaceWrite',
                  networkAccess: false,
                  writableRoots: [],
                  excludeTmpdirEnvVar: true,
                  excludeSlashTmp: true,
                },
                thread: { id: 'native-thread', ephemeral: false, turns: [] },
              },
              'turn/start': { turn: { id: 'native-turn', status: 'inProgress' } },
              'turn/interrupt': {},
            };
            if (frame.id !== undefined && frame.method) {
              if (frame.method === 'thread/resume') {
                push({
                  method: 'thread/tokenUsage/updated',
                  params: {
                    threadId: 'native-thread',
                    turnId: 'previous-turn',
                    tokenUsage: { total: { inputTokens: 42 } },
                  },
                });
                push({ method: 'thread/goal/cleared', params: { threadId: 'native-thread' } });
                push({ id: frame.id, result: responses['thread/start'] });
              } else {
                if (!(frame.method in responses)) {
                  throw new Error('Unexpected RPC');
                }

                push({ id: frame.id, result: responses[frame.method] });
              }

              if (frame.method === 'turn/start') {
                push({
                  method: 'turn/started',
                  params: {
                    threadId: 'native-thread',
                    turn: { id: 'native-turn', status: 'inProgress' },
                  },
                });
              }

              if (frame.method === 'turn/interrupt') {
                finish('interrupted');
              }
            }

            return Promise.resolve();
          },
          async *lines() {
            while (!ended) {
              if (!incoming.length) {
                await new Promise<void>((resolve) => {
                  wake = resolve;
                });
              }

              wake = undefined;
              const line = incoming.shift();
              if (line !== undefined) {
                yield line;
              }
            }
          },
          dispose() {
            ended = true;
            wake?.();

            return Promise.resolve({
              process: options.unknown
                ? { state: 'unknown' as const, reason: 'unverified-tree' as const }
                : { state: 'stopped' as const, reason: 'tree-killed' as const },
              cleanup: [],
            });
          },
        });
      },
    },
  );
  function finish(status = 'completed') {
    push({
      method: 'turn/completed',
      params: {
        threadId: 'native-thread',
        turnId: 'native-turn',
        turn: { id: 'native-turn', status },
      },
    });
  }

  const ready = () =>
    vi.waitFor(() => expect(sent.some((frame) => frame.method === 'turn/start')).toBe(true));

  return { operation, facts, sent, beforeDispatch, abort, ready, finish, push };
}

it('durably correlates the assigned context before dispatch and passes native writer mode', async () => {
  const f = fixture();
  await f.ready();
  f.finish();
  await f.operation.done;
  expect(f.beforeDispatch).toHaveBeenCalledOnce();
  expect(f.sent.find((frame) => frame.method === 'turn/start')?.params).toMatchObject({
    input: [{ text: 'Literal @file /command' }],
    approvalPolicy: 'on-request',
    collaborationMode: {
      mode: 'default',
      settings: { model: 'controlled-model', reasoning_effort: 'low' },
    },
    sandboxPolicy: { type: 'workspaceWrite', networkAccess: false },
  });
  expect(await f.operation.settlement).toMatchObject({
    process: 'stopped',
    source: 'native-result',
    result: { outcome: 'completed' },
  });
});

it('retains independent native result evidence if canonical persistence fails', async () => {
  const f = fixture({ persistFails: true });
  await f.ready();
  f.finish();
  await expect(f.operation.done).rejects.toThrow('store unavailable');
  expect(await f.operation.settlement).toMatchObject({
    source: 'native-result',
    result: { outcome: 'completed' },
  });
});
it('resumes the exact thread and excludes historical usage snapshots from the new Turn', async () => {
  const f = fixture({ resume: true });
  await f.ready();
  f.finish();
  await f.operation.done;
  expect(f.sent.find((frame) => frame.method === 'thread/resume')?.params).toMatchObject({
    threadId: 'native-thread',
    excludeTurns: true,
  });
  expect(f.sent.some((frame) => frame.method === 'thread/start')).toBe(false);
  expect(f.facts.filter((fact) => fact.kind === 'usage')).toEqual([]);
  expect(await f.operation.settlement).toMatchObject({
    source: 'native-result',
    result: { outcome: 'completed' },
  });
});

it('never certifies a native result when tree settlement is unknown', async () => {
  const f = fixture({ unknown: true });
  await f.ready();
  f.finish();
  await f.operation.done;
  expect(await f.operation.settlement).toEqual({ process: 'unknown', source: 'unverified' });
  expect(f.facts.at(-1)).toMatchObject({ kind: 'lost' });
  expect(f.facts.some((fact) => fact.kind === 'outcome')).toBe(false);
});

it('requests native interruption and preserves its authoritative result', async () => {
  const f = fixture();
  await f.ready();
  f.abort.abort();
  await f.operation.done;
  expect(f.sent.filter((frame) => frame.method === 'turn/interrupt')).toHaveLength(1);
  expect(await f.operation.settlement).toMatchObject({
    source: 'native-result',
    result: { outcome: 'interrupted' },
  });
});

it('expires locally admitted grouped answers when the native question is withdrawn', async () => {
  const f = fixture();
  await f.ready();
  f.push({
    id: 'questions',
    method: 'item/tool/requestUserInput',
    params: {
      threadId: 'native-thread',
      turnId: 'native-turn',
      itemId: 'question-item',
      isBlocking: true,
      questions: [
        { id: 'one', header: 'One', question: 'First?' },
        { id: 'two', header: 'Two', question: 'Second?' },
      ],
    },
  });
  await vi.waitFor(() =>
    expect(f.facts.filter((fact) => fact.kind === 'interaction')).toHaveLength(2),
  );
  expect(
    await f.operation.respond('codex-question:1:0', {
      requestId: randomUUID(),
      kind: 'question',
      answer: { optionIds: [], text: 'First answer' },
    }),
  ).toEqual({ deliveredKeys: [] });
  f.push({ method: 'serverRequest/resolved', params: { requestId: 'questions' } });
  await vi.waitFor(() =>
    expect(f.facts.filter((fact) => fact.kind === 'interaction-expired')).toHaveLength(2),
  );
  expect(f.sent.some((frame) => frame.id === 'questions')).toBe(false);
  f.finish();
  await f.operation.done;
});

it('never acknowledges native delivery after a failed stdin write', async () => {
  const f = fixture({ replyFails: true });
  await f.ready();
  f.push({
    id: 'question',
    method: 'item/tool/requestUserInput',
    params: {
      threadId: 'native-thread',
      turnId: 'native-turn',
      itemId: 'question-item',
      isBlocking: true,
      questions: [{ id: 'one', header: 'One', question: 'First?' }],
    },
  });
  await vi.waitFor(() => expect(f.facts.some((fact) => fact.kind === 'interaction')).toBe(true));
  await expect(
    f.operation.respond('codex-question:1:0', {
      requestId: randomUUID(),
      kind: 'question',
      answer: { optionIds: [], text: 'Answer' },
    }),
  ).rejects.toThrow();
  f.push({ method: 'serverRequest/resolved', params: { requestId: 'question' } });
  f.finish();
  await f.operation.done;
  expect(f.facts).toContainEqual({ kind: 'interaction-expired', key: 'codex-question:1:0' });
});

it('never dispatches user input after installation revalidation fails', async () => {
  const f = fixture({ beforeInputFails: true });
  await f.operation.done;
  expect(f.beforeDispatch).not.toHaveBeenCalled();
  expect(f.sent.some((frame) => frame.method === 'turn/start')).toBe(false);
  expect(await f.operation.settlement).toMatchObject({
    process: 'stopped',
    source: 'not-started',
    result: { outcome: 'failed' },
  });
});
it('rejects a native process using a different credential home before account or thread requests', async () => {
  const f = fixture({ homeMismatch: true });
  await f.operation.done;
  expect(f.sent.map((frame) => frame.method)).toEqual(['initialize']);
  expect(f.beforeDispatch).not.toHaveBeenCalled();
  expect(await f.operation.settlement).toMatchObject({
    source: 'not-started',
    result: { outcome: 'failed' },
  });
});
it('treats an effective native policy escalation as unknown rather than successful completion', async () => {
  const f = fixture();
  await f.ready();
  f.push({
    method: 'thread/settings/updated',
    params: {
      threadId: 'native-thread',
      threadSettings: {
        cwd: resolve('codex-owned-workspace'),
        approvalPolicy: 'on-request',
        approvalsReviewer: 'user',
        sandboxPolicy: { type: 'dangerFullAccess' },
      },
    },
  });
  await f.operation.done;
  expect(await f.operation.settlement).toMatchObject({ source: 'unverified', process: 'stopped' });
  expect(f.facts.at(-1)).toMatchObject({ kind: 'lost' });
});
