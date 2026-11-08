import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { probeAntigravity } from './probe';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(overrides: { modelCode?: number; init?: unknown; stopped?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'specflow-agy-probe-'));
  roots.push(root);
  const launched: string[][] = [];
  const disposed = vi.fn();
  const launch: NonNullable<Parameters<typeof probeAntigravity>[1]> = (options) => {
    launched.push([...options.args]);
    const catalogue = options.args[0] === 'models';
    const frame = overrides.init ?? {
      event: 'init',
      conversation_id: 'allocated-before-input',
      init: { cwd: root, tools: [], permission_mode: 'strict' },
    };

    return Promise.resolve({
      async *lines() {
        yield await Promise.resolve(
          catalogue ? 'fixture-model\tFixture Model' : JSON.stringify(frame),
        );
      },
      done: Promise.resolve({ code: catalogue ? (overrides.modelCode ?? 0) : 1, signal: null }),
      async dispose() {
        disposed();
        await options.scope.close();

        return {
          process:
            overrides.stopped === false
              ? { state: 'unknown' as const, reason: 'unverified-tree' as const }
              : { state: 'stopped' as const, reason: 'tree-killed' as const },
          cleanup: [],
        };
      },
    });
  };

  return {
    launched,
    disposed,
    run: () =>
      probeAntigravity(
        {
          executable: join(root, 'controlled-executable'),
          workspace: root,
          temporaryRoot: root,
          environment: { values: {}, sources: {} },
          signal: new AbortController().signal,
          selection: { providerId: 'antigravity', mode: 'workspace-write' },
        },
        launch,
      ),
  };
}

describe('Antigravity no-input discovery', () => {
  it('reads model catalogue and pre-input context, disposing both owners', async () => {
    const test = await fixture();
    expect(await test.run()).toMatchObject({
      models: [{ modelId: 'fixture-model', title: 'Fixture Model', efforts: [] }],
      initialization: { conversationId: 'allocated-before-input', permissionMode: 'strict' },
    });
    expect(test.launched[0]).toEqual(['models']);
    expect(test.launched[1]).toContain('stream-json');
    expect(test.launched.flat()).not.toContain('--prompt');
    expect(test.disposed).toHaveBeenCalledTimes(2);
  });

  it('does not trust catalogue text from a failing process', async () => {
    const test = await fixture({ modelCode: 1 });
    await expect(test.run()).rejects.toMatchObject({ code: 'PROVIDER_CATALOGUE_UNAVAILABLE' });
    expect(test.launched).toHaveLength(1);
    expect(test.disposed).toHaveBeenCalledOnce();
  });

  it('does not accept a result frame instead of a pre-input init', async () => {
    const test = await fixture({ init: { event: 'result', result: { status: 'SUCCESS' } } });
    await expect(test.run()).rejects.toThrow();
    expect(test.disposed).toHaveBeenCalledTimes(2);
  });

  it('rejects discovery when process-tree settlement remains uncertain', async () => {
    const test = await fixture({ stopped: false });
    await expect(test.run()).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    expect(test.launched).toHaveLength(1);
  });
});
