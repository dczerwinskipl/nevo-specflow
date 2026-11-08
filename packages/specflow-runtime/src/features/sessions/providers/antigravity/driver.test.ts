import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { createAntigravityDriver } from './driver';
import { inspectAntigravityInstallation } from './installation';
import { SessionError } from '../../errors';
import { randomUUID } from 'node:crypto';
import type { EmitFact, Invocation } from '../driver';
import * as operationModule from './operation';
import type { launchOwnedProcess } from '../process';
import type { DriverFact } from '../../persistence/protocol';
import { runAntigravityHook } from './hook-client';

const roots: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(managedWrites = true, launch?: typeof launchOwnedProcess) {
  const root = await mkdtemp(join(tmpdir(), 'specflow-agy-driver-'));
  roots.push(root);
  const workspace = join(root, 'workspace');
  const executable = join(root, 'fixture.exe');
  await mkdir(workspace);
  await writeFile(executable, 'not executable, never launched');
  let accountScope = 'fixture-account';
  let authenticationFingerprint = 'fixture-access-one';
  let authRequired = false;
  const options = {
    workspace,
    executable,
    homeRoot: join(root, 'private'),
    temporaryRoot: join(root, 'temporary'),
    managedWrites,
  };
  const inspect = () => {
    if (authRequired) {
      return Promise.reject(new SessionError('PROVIDER_AUTH_REQUIRED', 'Synthetic login expired.'));
    }

    return inspectAntigravityInstallation(
      { ...options, signal: new AbortController().signal },
      {
        platform: 'win32',
        architecture: 'x64',
        host: { SYSTEMROOT: root },
        account: () =>
          Promise.resolve({
            accountScope,
            authenticationFingerprint,
            source: 'windows-keyring',
            authenticationMode: 'consumer',
          }),
      },
    );
  };

  const probe = vi.fn(() =>
    Promise.resolve({
      models: [{ modelId: 'fixture-model', title: 'Fixture', efforts: [] }],
      initialization: {
        conversationId: 'fixture-native',
        cwd: workspace,
        permissionMode: 'proceed-in-sandbox',
        tools: ['view_file', 'write_to_file', 'run_command', 'call_mcp_tool'],
      },
    }),
  );
  const driver = createAntigravityDriver(options, {
    inspect,
    probe,
    launch,
    helper: join(root, 'synthetic-hook.js'),
  });

  return {
    driver,
    probe,
    executable,
    workspace,
    refresh: () => driver.refresh!(new AbortController().signal),
    rotateToken() {
      authenticationFingerprint = 'fixture-access-two';
    },
    switchAccount() {
      accountScope = 'fixture-account-two';
    },
    expireLogin() {
      authRequired = true;
    },
  };
}

describe('Antigravity driver discovery and admission', () => {
  it('checks the required APIs while tolerating added tools in a compatible update', async () => {
    const test = await fixture();
    const original = test.probe.getMockImplementation()!;
    test.probe.mockImplementationOnce(async () => {
      const result = await original();
      result.initialization.tools.push('future_optional_tool');

      return result;
    });
    expect(await test.refresh()).toMatchObject({
      readiness: 'ready',
      compatibility: { classification: 'provisional' },
    });
  });

  it.each(['view_file', 'write_to_file', 'run_command'])(
    'rejects a native installation missing required API %s rather than an unlisted hash',
    async (missing) => {
      const test = await fixture();
      const original = test.probe.getMockImplementation()!;
      test.probe.mockImplementationOnce(async () => {
        const result = await original();
        result.initialization.tools = result.initialization.tools.filter(
          (tool) => tool !== missing,
        );

        return result;
      });
      expect(await test.refresh()).toMatchObject({ readiness: 'unavailable' });
    },
  );
  it('exposes native Agent and Plan only after managed admission', async () => {
    const test = await fixture();
    expect(await test.refresh()).toMatchObject({
      readiness: 'ready',
      defaultModeId: 'accept-edits',
      compatibility: { classification: 'provisional' },
      providerModes: [
        { modeId: 'accept-edits', mode: 'workspace-write', readiness: 'ready' },
        { modeId: 'plan', mode: 'workspace-write', readiness: 'ready' },
      ],
    });
    expect(test.probe).toHaveBeenCalledOnce();
    await test.driver.validate({
      providerId: 'antigravity',
      mode: 'workspace-write',
      modelId: 'fixture-model',
    });
    expect(test.probe).toHaveBeenCalledOnce();
  });

  it('keeps discovery available without authorizing native workspace execution', async () => {
    const test = await fixture(false);
    expect(await test.refresh()).toMatchObject({
      readiness: 'unavailable',
      reason: 'Managed Antigravity requires Engine write admission.',
      compatibility: { classification: 'provisional' },
      providerModes: [
        { modeId: 'accept-edits', readiness: 'unavailable' },
        { modeId: 'plan', readiness: 'unavailable' },
      ],
    });
    expect(test.driver.supportsManagedWrites).toBe(false);
    for (const providerModeId of ['accept-edits', 'plan']) {
      await expect(
        test.driver.validate({
          providerId: 'antigravity',
          mode: 'workspace-write',
          providerModeId,
        }),
      ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    }

    expect(test.probe).toHaveBeenCalledOnce();
  });

  it('reuses account affinity after token rotation and rechecks a switched account', async () => {
    const test = await fixture();
    await test.refresh();
    const scope = test.driver.contextScope!();
    test.rotateToken();
    await test.refresh();
    expect(test.driver.contextScope!()).toBe(scope);
    expect(test.probe).toHaveBeenCalledOnce();
    test.switchAccount();
    await test.refresh();
    expect(test.driver.contextScope!()).not.toBe(scope);
    expect(test.probe).toHaveBeenCalledTimes(2);
  });

  it('invalidates a changed executable and rejects changes during discovery', async () => {
    const test = await fixture();
    await test.refresh();
    await writeFile(test.executable, 'updated fixture');
    const stableProbe = test.probe.getMockImplementation()!;
    test.probe.mockImplementationOnce(async () => {
      await writeFile(test.executable, 'second update during probe');

      return stableProbe();
    });
    expect(await test.refresh()).toMatchObject({ readiness: 'unavailable' });
    expect(test.driver.contextScope!()).toBe('');
  });

  it('requires explicit supported model and effort selections', async () => {
    const test = await fixture();
    await expect(
      test.driver.validate({
        providerId: 'antigravity',
        mode: 'workspace-write',
        modelId: 'missing',
      }),
    ).rejects.toMatchObject({ code: 'MODEL_UNSUPPORTED' });
    await expect(
      test.driver.validate({
        providerId: 'antigravity',
        mode: 'workspace-write',
        modelId: 'fixture-model',
        effort: 'high',
      }),
    ).rejects.toMatchObject({ code: 'CAPABILITY_UNSUPPORTED' });
  });

  it('publishes bounded authentication-required state without native requests or replay', async () => {
    const test = await fixture();
    await test.refresh();
    test.expireLogin();
    expect(await test.refresh()).toMatchObject({
      readiness: 'authenticationRequired',
      reasonCode: 'AUTHENTICATION_REQUIRED',
    });
    expect(test.probe).toHaveBeenCalledOnce();
    expect(test.driver.contextScope!()).toBe('');
  });
});

async function invocationFixture(
  resume = false,
  beforeResult?: Promise<void>,
  managedWrites = true,
) {
  const order: string[] = [];
  const writes: string[] = [];
  const nativeId = 'controlled-native-conversation';
  const input = Promise.withResolvers<void>();
  const exit = Promise.withResolvers<{ code: number | null; signal: NodeJS.Signals | null }>();
  let stopped = false;
  let naturalExit = false;
  let launchOptions: Parameters<typeof launchOwnedProcess>[0] | undefined;
  const launch: typeof launchOwnedProcess = vi.fn(
    (options: Parameters<typeof launchOwnedProcess>[0]) => {
      launchOptions = options;

      return Promise.resolve({
        done: exit.promise,
        write: vi.fn((line: string) => {
          order.push('input');
          writes.push(line);
          input.resolve();

          return Promise.resolve();
        }),
        async endInput() {
          order.push('eof');
          const configurationPath = options.environment.values.NEVO_ANTIGRAVITY_HOOK_CONFIG!;
          expect(
            await runAntigravityHook({
              hook: 'stop',
              configurationPath,
              input: Buffer.from(
                JSON.stringify({
                  conversationId: nativeId,
                  workspacePaths: [options.cwd],
                  executionNum: 1,
                  terminationReason: 'model_stop',
                  fullyIdle: true,
                }),
              ),
              signal: options.signal,
            }),
          ).toEqual({ decision: 'stop' });
          order.push('native-idle');
          naturalExit = true;
          exit.resolve({ code: 0, signal: null });
        },
        async dispose() {
          stopped = true;
          input.resolve();
          exit.resolve({ code: 0, signal: null });
          const cleanup = await options.scope.close();

          return {
            process: {
              state: 'stopped' as const,
              reason: naturalExit ? ('group-exited' as const) : ('tree-killed' as const),
            },
            cleanup,
          };
        },
        async *lines() {
          order.push('init');
          yield JSON.stringify({
            event: 'init',
            conversation_id: nativeId,
            init: {
              cwd: options.cwd,
              permission_mode: 'proceed-in-sandbox',
              tools: ['view_file', 'write_to_file', 'run_command', 'call_mcp_tool'],
            },
          });
          await input.promise;
          await beforeResult;
          if (stopped) {
            return;
          }

          yield JSON.stringify({
            event: 'result',
            result: {
              conversation_id: nativeId,
              status: 'SUCCESS',
              response: 'Controlled short answer',
            },
          });
        },
      });
    },
  );
  const test = await fixture(managedWrites, launch);
  await test.refresh();
  const facts: DriverFact[] = [];
  const invocationId = randomUUID();
  const beforeDispatch = vi.fn(() => {
    order.push('before-dispatch');

    return Promise.resolve();
  });
  const invocation: Invocation = {
    sessionId: randomUUID(),
    turnId: randomUUID(),
    invocationId,
    request: {
      requestId: randomUUID(),
      message: '/literal @file\nA short controlled test; do not execute commands.',
    },
    selection: {
      providerId: 'antigravity',
      mode: 'workspace-write',
      providerModeId: 'accept-edits',
      modelId: 'fixture-model',
    },
    executionContext: {
      kind: 'workspace-write',
      workspace: test.workspace,
      temporaryRoot: test.workspace,
      workspaceIdentity: 'controlled-workspace',
      admission: { operationId: invocationId, scope: 'project' },
    },
    providerContext: {
      nativeSessionId: resume ? nativeId : randomUUID(),
      resume,
      scope: test.driver.contextScope!(),
    },
    beforeDispatch,
  };
  const start = () =>
    test.driver.start(
      invocation,
      (fact) => {
        facts.push(fact);
        order.push(fact.kind);

        return Promise.resolve();
      },
      new AbortController().signal,
    );

  return {
    ...test,
    invocation,
    facts,
    order,
    writes,
    launch,
    nativeId,
    beforeDispatch,
    start,
    options: () => launchOptions!,
  };
}

describe('controlled Antigravity driver invocation composition', () => {
  it('rejects start before launching the CLI even with a matching Engine admission', async () => {
    const test = await invocationFixture(false, undefined, false);
    expect(test.start).toThrow(expect.objectContaining({ code: 'CAPABILITY_UNSUPPORTED' }));
    expect(test.launch).not.toHaveBeenCalled();
    expect(test.invocation.beforeDispatch).not.toHaveBeenCalled();
    expect(test.facts).toEqual([]);
  });

  it('keeps a rotated cached login available when a dispatched older login later reports authentication failure', async () => {
    const resultGate = Promise.withResolvers<void>();
    let emitFromOperation: EmitFact | undefined;
    const original = operationModule.createAntigravityOperation;
    vi.spyOn(operationModule, 'createAntigravityOperation').mockImplementationOnce(
      (invocation, emit, signal, options) => {
        emitFromOperation = emit;

        return original(invocation, emit, signal, options);
      },
    );
    const test = await invocationFixture(false, resultGate.promise);
    const operation = test.start();
    try {
      await vi.waitFor(() => expect(test.writes).toHaveLength(1));
      test.rotateToken();
      expect(await test.refresh()).toMatchObject({ readiness: 'ready' });
      expect(test.probe).toHaveBeenCalledOnce();
      await emitFromOperation!({
        kind: 'outcome',
        outcome: 'failed',
        error: { code: 'PROVIDER_AUTH_REQUIRED', message: 'Synthetic old login rejected.' },
      });
      expect(test.driver.describe()).toMatchObject({ readiness: 'ready' });
      expect(await test.refresh()).toMatchObject({ readiness: 'ready' });
      expect(test.probe).toHaveBeenCalledOnce();
    } finally {
      resultGate.resolve();
      await operation.done;
    }
  });

  it('correlates before dispatch, sends literal input and settles after the authenticated native Stop hook', async () => {
    const test = await invocationFixture();
    const operation = test.start();
    await operation.done;
    expect(test.order.slice(0, 4)).toEqual(['init', 'correlation', 'before-dispatch', 'input']);
    expect(test.writes).toEqual([
      JSON.stringify({ event: 'user', message: { content: test.invocation.request.message } }) +
        '\n',
    ]);
    expect(test.options().args).not.toContain(test.invocation.request.message);
    const hookFile = test.options().environment.values.NEVO_ANTIGRAVITY_HOOK_CONFIG!;
    expect(relative(test.workspace, hookFile).split(sep)[0]).toBe('..');
    expect(test.options().args).not.toContain('--conversation');
    expect(test.facts.find((fact) => fact.kind === 'correlation')).toMatchObject({
      providerSessionId: test.nativeId,
    });
    expect(test.facts.at(-1)).toMatchObject({ kind: 'outcome', outcome: 'completed' });
    expect(test.order.indexOf('outcome')).toBeGreaterThan(test.order.indexOf('native-idle'));
    expect(await operation.settlement).toMatchObject({
      process: 'stopped',
      source: 'native-result',
    });
  });

  it('continues the same invocation around a pending permission and settles without a second dispatch', async () => {
    const gate = Promise.withResolvers<void>();
    const test = await invocationFixture(false, gate.promise);
    const operation = test.start();
    try {
      await vi.waitFor(() => expect(test.writes).toHaveLength(1));
      const configurationPath = test.options().environment.values.NEVO_ANTIGRAVITY_HOOK_CONFIG!;
      const hook = (role: 'pre-tool-use' | 'stop', body: object) =>
        runAntigravityHook({
          hook: role,
          configurationPath,
          signal: new AbortController().signal,
          input: Buffer.from(
            JSON.stringify({
              conversationId: test.nativeId,
              workspacePaths: [test.workspace],
              ...body,
            }),
          ),
        });
      const permission = hook('pre-tool-use', {
        stepIdx: 0,
        toolCall: {
          name: 'run_command',
          args: {
            CommandLine: 'echo controlled fixture',
            toolSummary: 'Controlled fixture',
            toolAction: 'execute',
            Cwd: test.workspace,
            WaitMsBeforeAsync: 5000,
          },
        },
      });
      await vi.waitFor(() =>
        expect(test.facts.some((fact) => fact.kind === 'interaction')).toBe(true),
      );
      const fact = test.facts.find((fact) => fact.kind === 'interaction')!;
      await expect(
        hook('stop', { executionNum: 0, terminationReason: 'NO_TOOL_CALL', fullyIdle: true }),
      ).resolves.toEqual({ decision: 'continue' });
      expect(test.facts.some((fact) => fact.kind === 'outcome')).toBe(false);
      await operation.respond(fact.key, {
        requestId: randomUUID(),
        kind: 'permission',
        decision: 'deny',
      });
      await expect(permission).resolves.toEqual({ decision: 'deny' });
    } finally {
      gate.resolve();
      await operation.done;
    }

    expect(test.launch).toHaveBeenCalledOnce();
    expect(test.beforeDispatch).toHaveBeenCalledOnce();
    expect(test.writes).toHaveLength(1);
    expect(await operation.settlement).toMatchObject({
      process: 'stopped',
      source: 'native-result',
      result: { outcome: 'completed' },
    });
  });

  it('resumes exactly the admitted native conversation without replacing its identity', async () => {
    const test = await invocationFixture(true);
    const operation = test.start();
    await operation.done;
    const args = test.options().args;
    expect(args[args.indexOf('--conversation') + 1]).toBe(test.nativeId);
    expect(test.facts.find((fact) => fact.kind === 'correlation')).toMatchObject({
      providerSessionId: test.nativeId,
    });
    expect(await operation.settlement).toMatchObject({ source: 'native-result' });
  });

  it('rejects a switched account at the durable dispatch barrier without sending input', async () => {
    const test = await invocationFixture();
    test.beforeDispatch.mockImplementationOnce(() => {
      test.switchAccount();

      return Promise.resolve();
    });
    const operation = test.start();
    await operation.done;
    expect(test.launch).toHaveBeenCalledOnce();
    expect(test.beforeDispatch).toHaveBeenCalledOnce();
    expect(test.writes).toEqual([]);
    expect(test.facts.at(-1)).toMatchObject({
      kind: 'outcome',
      outcome: 'failed',
      error: { code: 'SESSION_RECOVERY_REQUIRED' },
    });
    expect(await operation.settlement).toMatchObject({ process: 'stopped', source: 'not-started' });
  });
});
