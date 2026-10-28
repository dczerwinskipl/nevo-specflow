import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { probeClaude } from './probe';
import type { launchOwnedProcess } from '../process';

let root = '';
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

it.each(['compatible', 'malformed', 'uncertain-settlement'] as const)(
  'bounds unpaid discovery and disposes its process: %s',
  async (scenario) => {
    root = await mkdtemp(join(tmpdir(), 'claude-probe-'));
    const writes: Record<string, unknown>[] = [];
    const dispose = vi.fn(() =>
      Promise.resolve({
        process: {
          state: scenario === 'uncertain-settlement' ? ('unknown' as const) : ('stopped' as const),
          reason: 'unverified-tree' as const,
        },
        cleanup: [],
      }),
    );
    const launch: typeof launchOwnedProcess = (options) =>
      Promise.resolve({
        done: Promise.resolve({ code: 0, signal: null }),
        dispose,
        write(line) {
          writes.push(JSON.parse(line) as Record<string, unknown>);
          return Promise.resolve();
        },
        async *lines() {
          yield JSON.stringify(
            scenario === 'malformed'
              ? { type: 'unsupported' }
              : {
                  type: 'control_response',
                  response: {
                    subtype: 'success',
                    request_id: writes[0]!.request_id,
                    response: {
                      claude_code_version: '9.0.0',
                      models: [{ value: 'default', displayName: 'Native default' }],
                    },
                  },
                },
          );
          await options.scope.close();
        },
      });
    const request = probeClaude(
      {
        executable: process.execPath,
        workspace: root,
        temporaryRoot: root,
        environment: { values: {}, sources: {} },
        secrets: [],
        signal: new AbortController().signal,
      },
      launch,
    );
    if (scenario === 'compatible') expect(await request).toMatchObject({ version: '9.0.0' });
    else
      await expect(request).rejects.toMatchObject({
        reasonCode:
          scenario === 'malformed' ? 'PROTOCOL_UNSUPPORTED' : 'PROCESS_SETTLEMENT_UNVERIFIED',
      });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      type: 'control_request',
      request: { subtype: 'initialize' },
    });
    expect(dispose).toHaveBeenCalledOnce();
  },
);
