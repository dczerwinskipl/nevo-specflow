import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { createClaudeDriver } from './driver';
import { ClaudeProbeError, type probeClaude } from './probe';
import { bundledClaudeBuild } from '../compatibility/catalogue';
import type { inspectClaudeInstallation } from './installation';
import type { DriverFact } from '../../persistence/protocol';

const boundary = vi.hoisted(() => ({
  allocate: vi.fn(() => Promise.reject(new Error('Unexpected invocation allocation'))),
}));
vi.mock('../process', async (original) => ({
  ...(await original<typeof import('../process')>()),
  createInvocationScope: boundary.allocate,
}));

type Installation = Awaited<ReturnType<typeof inspectClaudeInstallation>>;
const models = [{ modelId: 'default', title: 'Native default', efforts: ['low'] }];
function fixture(managedWrites = false) {
  let installation: Installation = {
    executable: resolve('claude.exe'),
    sha256: bundledClaudeBuild.sha256,
    fingerprint: 'original',
    platform: 'win32',
    architecture: 'x64',
    accountScope: 'account',
    secrets: [],
  };
  const inspect = vi.fn(() => Promise.resolve(installation));
  const probe = vi.fn<typeof probeClaude>().mockResolvedValue({ models, version: '2.1.296' });
  const driver = createClaudeDriver(
    {
      workspace: resolve('workspace'),
      temporaryRoot: resolve('temporary'),
      environment: { values: {}, sources: {} },
      managedWrites,
    },
    { inspect, probe },
  );
  return {
    driver,
    inspect,
    probe,
    change: (next: Partial<Installation>) => {
      installation = { ...installation, ...next };
    },
  };
}
it('discovers native writable modes independently and uses the native default model without inventing an alias', async () => {
  const f = fixture(true);
  f.probe.mockImplementation((options) =>
    options.selection?.providerModeId === 'auto'
      ? Promise.reject(new ClaudeProbeError('PROTOCOL_UNSUPPORTED', 'Unsupported mode.'))
      : Promise.resolve({
          models: [{ modelId: 'haiku', title: 'Haiku', efforts: [] }],
          version: '2.1.296',
        }),
  );
  await f.driver.validate({
    providerId: 'claude',
    mode: 'workspace-write',
    providerModeId: 'acceptEdits',
  });
  expect(f.driver.describe()).toMatchObject({
    defaultModeId: 'acceptEdits',
    modes: ['read-only', 'workspace-write'],
  });
  expect(f.driver.describe().providerModes).toContainEqual(
    expect.objectContaining({ modeId: 'auto', readiness: 'unavailable' }),
  );
  await expect(
    f.driver.validate({ providerId: 'claude', mode: 'workspace-write', providerModeId: 'auto' }),
  ).rejects.toThrow('unavailable');
  await expect(
    f.driver.validate({ providerId: 'claude', mode: 'read-only', providerModeId: 'acceptEdits' }),
  ).rejects.toThrow('matching effect authority');
  expect(f.probe).toHaveBeenCalledTimes(5);
});
afterEach(() => {
  vi.useRealTimers();
  boundary.allocate.mockClear();
});

it.each(['2.1.296', '2.1.297', '9.0.0', undefined])(
  'allows compatible unlisted %s without a catalogue or network service',
  async (version) => {
    const f = fixture();
    f.change({ sha256: 'a'.repeat(64), fingerprint: 'new' });
    f.probe.mockResolvedValue({ models, ...(version ? { version } : {}) });
    await f.driver.validate({ providerId: 'claude', mode: 'read-only' });
    expect(f.driver.describe()).toMatchObject({
      readiness: 'ready',
      compatibility: { classification: 'provisional' },
    });
  },
);

it('labels only the known build with matching integration evidence as tested', async () => {
  const f = fixture();
  await f.driver.refresh!(new AbortController().signal);
  expect(f.driver.describe().compatibility?.classification).toBe('tested');
  f.probe.mockResolvedValue({ models });
  f.change({ fingerprint: 'recheck' });
  await f.driver.refresh!(new AbortController().signal);
  expect(f.driver.describe().compatibility?.classification).toBe('provisional');
});

it('reprobes changed binary or profile configuration instead of trusting a fresh cache', async () => {
  const f = fixture();
  await f.driver.validate({ providerId: 'claude', mode: 'read-only' });
  await f.driver.validate({ providerId: 'claude', mode: 'read-only' });
  expect(f.probe).toHaveBeenCalledTimes(1);
  f.change({ fingerprint: 'updated', sha256: 'b'.repeat(64) });
  await f.driver.validate({ providerId: 'claude', mode: 'read-only' });
  expect(f.probe).toHaveBeenCalledTimes(2);
  f.change({ fingerprint: 'different-policy' });
  await f.driver.validate({ providerId: 'claude', mode: 'read-only' });
  expect(f.probe).toHaveBeenCalledTimes(3);
});

it('discards a successful probe if the installation changes during it', async () => {
  const f = fixture();
  f.probe.mockImplementationOnce(() => {
    f.change({ fingerprint: 'updated-mid-probe', sha256: 'c'.repeat(64) });
    return Promise.resolve({
      models: [{ modelId: 'stale', title: 'Stale', efforts: [] }],
      version: '2.1.296',
    });
  });
  await f.driver.validate({ providerId: 'claude', mode: 'read-only' });
  expect(f.probe).toHaveBeenCalledTimes(2);
  expect(f.driver.describe().models).toEqual(models);
  expect(f.driver.describe().compatibility?.classification).toBe('provisional');
});

it.each(['model', 'effort'] as const)(
  'revalidates %s selection after an update between admission and launch',
  async (changed) => {
    const f = fixture();
    const selection = { providerId: 'claude', mode: 'read-only' as const, effort: 'low' };
    await f.driver.validate(selection);
    f.change({ fingerprint: 'new-build', sha256: 'd'.repeat(64) });
    f.probe.mockResolvedValue({
      version: '9.0.0',
      models:
        changed === 'model'
          ? [{ modelId: 'other', title: 'Other model', efforts: ['low'] }]
          : [{ modelId: 'default', title: 'Default', efforts: [] }],
    });
    const facts: DriverFact[] = [];
    const dispatch = vi.fn(() => Promise.resolve());
    const operation = f.driver.start(
      {
        sessionId: randomUUID(),
        turnId: randomUUID(),
        invocationId: randomUUID(),
        request: { requestId: randomUUID(), message: 'Must not dispatch' },
        selection,
        executionContext: {
          kind: 'read-only',
          workspace: resolve('workspace'),
          temporaryRoot: resolve('temporary'),
        },
        providerContext: { nativeSessionId: randomUUID(), resume: true, scope: 'account' },
        beforeDispatch: dispatch,
      },
      (fact) => {
        facts.push(fact);
        return Promise.resolve();
      },
      new AbortController().signal,
    );
    await operation.done;
    expect(f.probe).toHaveBeenCalledTimes(2);
    expect(boundary.allocate).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(facts.at(-1)).toMatchObject({ kind: 'outcome', outcome: 'failed' });
  },
);

it.each(['PROTOCOL_UNSUPPORTED', 'RESTRICTION_UNSUPPORTED'] as const)(
  'blocks an actually failed %s check with a structural reason',
  async (reasonCode) => {
    const f = fixture();
    f.probe.mockRejectedValue(new ClaudeProbeError(reasonCode, 'Required check failed.'));
    await expect(f.driver.validate({ providerId: 'claude', mode: 'read-only' })).rejects.toThrow();
    expect(f.driver.describe()).toMatchObject({
      readiness: 'unavailable',
      reasonCode,
      compatibility: { classification: 'unsupported' },
    });
  },
);

it('keeps a cancelled probe unavailable without inventing tested or unsupported status', async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.probe.mockImplementation(
    ({ signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('Private native detail')), {
          once: true,
        });
      }),
  );
  const controller = new AbortController();
  const result = f.driver.refresh!(controller.signal);
  await vi.waitFor(() => expect(f.probe).toHaveBeenCalledOnce());
  controller.abort();
  expect(await result).toMatchObject({ readiness: 'unavailable', reasonCode: 'PROBE_FAILED' });
  expect(f.driver.describe().compatibility).toBeUndefined();
  expect(JSON.stringify(f.driver.describe())).not.toContain('Private native detail');
});
