import { resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import type { EmitFact, Invocation } from '../../src/features/sessions/providers/driver';
import { createClaudeDriver } from '../../src/features/sessions/providers/claude/driver';
import { createCodexDriver } from '../../src/features/sessions/providers/codex/driver';
import { SessionError } from '../../src/features/sessions/errors';

// Exercise real discovery/admission and late native facts without launching a CLI.
const native = vi.hoisted(() => ({
  operations: [] as {
    emit: EmitFact;
    launch(signal: AbortSignal): Promise<unknown>;
    dispatch?: () => Promise<void>;
    verifyInput?: () => Promise<void>;
  }[],
}));
vi.mock('../../src/features/sessions/providers/process', async (original) => ({
  ...(await original<typeof import('../../src/features/sessions/providers/process')>()),
  createInvocationScope: () => Promise.resolve({}),
  launchOwnedProcess: () => Promise.resolve({}),
}));
function operation(
  invocation: Invocation,
  emit: EmitFact,
  _signal: AbortSignal,
  options: {
    launch(signal: AbortSignal): Promise<unknown>;
    beforeInput?(signal: AbortSignal): Promise<void>;
    initialize?(payload: Record<string, unknown>): Promise<void>;
  },
) {
  native.operations.push({
    emit,
    launch: (signal) => options.launch(signal),
    dispatch: invocation.beforeDispatch,
    verifyInput: () =>
      options.beforeInput ? options.beforeInput(_signal) : options.initialize!({ models: [] }),
  });
  return { done: Promise.resolve(), respond: () => Promise.resolve({ deliveredKeys: [] }) };
}
vi.mock('../../src/features/sessions/providers/claude/operation', () => ({
  createClaudeOperation: (...args: Parameters<typeof operation>) => operation(...args),
}));
vi.mock('../../src/features/sessions/providers/codex/operation', () => ({
  createCodexOperation: (...args: Parameters<typeof operation>) => operation(...args),
}));

it.each(['claude', 'codex'] as const)(
  '%s rejects the launched login, preserves a newer login, and only recovers after external renewal',
  async (providerId) => {
    native.operations.length = 0;
    let login = 'login-a';
    const workspace = resolve('controlled-workspace');
    const inspect = vi.fn(() =>
      Promise.resolve({
        executable: resolve('controlled.exe'),
        home: resolve('private-home'),
        sha256: 'a'.repeat(64),
        fingerprint: login,
        authenticationFingerprint: login,
        version: '9.0.0',
        platform: 'win32' as const,
        architecture: 'x64' as const,
        accountScope: 'stable-account',
        secrets: [],
        environment: { values: {}, sources: {} },
      }),
    );
    const probe = vi.fn(() =>
      Promise.resolve({
        models: [],
        version: '9.0.0',
        modes: ['default', 'plan'],
        boundary: { readOnly: true, write: true },
      }),
    );
    const options = {
      workspace,
      temporaryRoot: resolve('temporary'),
      homeRoot: resolve('private-home'),
    };
    const driver =
      providerId === 'claude'
        ? createClaudeDriver(
            { ...options, environment: { values: {}, sources: {} } },
            { inspect, probe },
          )
        : createCodexDriver(options, { inspect, probe });
    const signal = new AbortController().signal;
    const selection = { providerId, mode: 'read-only' as const, providerModeId: 'plan' };
    await driver.validate(selection, signal);
    async function launch(dispatch = true) {
      driver.start(
        {
          sessionId: 'session',
          turnId: 'turn',
          invocationId: 'invocation',
          selection,
          request: { requestId: 'request', message: 'Controlled request' },
          executionContext: { kind: 'read-only', workspace, temporaryRoot: options.temporaryRoot },
          providerContext: { nativeSessionId: 'native', resume: true, scope: 'stable-account' },
          beforeDispatch: () => Promise.resolve(),
        },
        () => Promise.resolve(),
        signal,
      );
      const entry = native.operations.at(-1)!;
      await entry.launch(signal);
      if (dispatch) await entry.dispatch!();
      return entry;
    }
    const old = await launch();
    login = 'login-b';
    expect((await driver.refresh!(signal)).readiness).toBe('ready');
    const rejection = {
      kind: 'outcome' as const,
      outcome: 'failed' as const,
      error: { code: 'PROVIDER_AUTH_REQUIRED', message: 'Synthetic login rejected' },
    };
    await old.emit(rejection);
    expect((await driver.refresh!(signal)).readiness).toBe('ready');
    const current = await launch();
    await current.emit(rejection);
    await old.emit(rejection); // A late second rejection cannot erase B's rejection.
    expect((await driver.refresh!(signal)).readiness).toBe('authenticationRequired');
    await expect(driver.validate(selection, signal)).rejects.toMatchObject({
      code: 'PROVIDER_AUTH_REQUIRED',
    });
    expect(native.operations).toHaveLength(2);
    login = 'login-c';
    expect((await driver.refresh!(signal)).readiness).toBe('ready');
    expect(driver.contextScope!()).toBe('stable-account');
    const preInput = await launch(false);
    inspect.mockRejectedValueOnce(
      new SessionError('PROVIDER_AUTH_REQUIRED', 'Source temporarily unavailable'),
    );
    await expect(preInput.verifyInput!()).rejects.toMatchObject({ code: 'PROVIDER_AUTH_REQUIRED' });
    await preInput.emit(rejection);
    expect((await driver.refresh!(signal)).readiness).toBe('ready');
    expect(driver.contextScope!()).toBe('stable-account');
    expect(native.operations).toHaveLength(3); // Rechecking never starts another Turn.
    login = 'login-d';
    probe.mockRejectedValueOnce(new SessionError('PROVIDER_AUTH_REQUIRED', 'New login rejected'));
    expect((await driver.refresh!(signal)).readiness).toBe('authenticationRequired');
    expect((await driver.refresh!(signal)).readiness).toBe('authenticationRequired');
    login = 'login-e';
    expect((await driver.refresh!(signal)).readiness).toBe('ready');
    expect(native.operations).toHaveLength(3);
    login = 'login-f';
    const stillValid = await inspect();
    inspect
      .mockResolvedValueOnce(stillValid)
      .mockRejectedValueOnce(
        new SessionError('PROVIDER_AUTH_REQUIRED', 'Source temporarily unreadable after probe'),
      );
    expect((await driver.refresh!(signal)).readiness).toBe('authenticationRequired');
    expect((await driver.refresh!(signal)).readiness).toBe('ready');
    expect(driver.contextScope!()).toBe('stable-account');
  },
);
