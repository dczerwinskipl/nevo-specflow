import { describe, expect, it } from 'vitest';

import { GitCapabilityError } from '../../../git/errors';
import type { DocumentBatchRecord } from '../changes/journal';
import {
  REFUSED_PATH_SEARCH_MAX_CHECKS,
  REFUSED_PATH_SEARCH_MAX_MS,
  pathsRefusedWith,
} from './evidence';
import type { QueueRuntime } from './runtime';

const batch = { operationId: 'b', branch: 'main' } as unknown as DocumentBatchRecord;

/** A runtime whose preflight refuses the paths in `refused` and counts its checks. */
function runtime(refused: ReadonlySet<string>, clock = { now: 0, step: 0 }) {
  const calls = { checks: 0 };
  const rt = {
    checkout: { root: 'root', workspaceId: 'w' },
    clock: {
      monotonicMs: () => {
        clock.now += clock.step;
        return clock.now;
      },
      wallMs: () => 0,
    },
    commits: {
      preflight: (request: { paths: readonly string[] }) => {
        calls.checks += 1;
        return request.paths.some((path) => refused.has(path))
          ? Promise.reject(new GitCapabilityError('COMMIT_BLOCKED', 'x', 'path-ignored'))
          : Promise.resolve();
      },
    },
  } as unknown as QueueRuntime;
  return { rt, calls };
}

const paths = (count: number): string[] => Array.from({ length: count }, (_, i) => `p-${i}.md`);

describe('searching for the paths the port refuses', () => {
  it('finds the few refused paths by halving', async () => {
    const all = paths(100);
    const { rt, calls } = runtime(new Set([all[3]!, all[40]!, all[99]!]));
    expect(await pathsRefusedWith(rt, batch, all, 'path-ignored')).toEqual([
      all[3],
      all[40],
      all[99],
    ]);
    expect(calls.checks).toBeLessThan(REFUSED_PATH_SEARCH_MAX_CHECKS);
  });

  it('gives up after its budget of checks instead of probing every path', async () => {
    const all = paths(200);
    const { rt, calls } = runtime(new Set(all));
    expect(await pathsRefusedWith(rt, batch, all, 'path-ignored')).toBeUndefined();
    expect(calls.checks).toBeLessThanOrEqual(REFUSED_PATH_SEARCH_MAX_CHECKS);
  });

  it('gives up after its time budget', async () => {
    const all = paths(8);
    const { rt } = runtime(new Set(all), { now: 0, step: REFUSED_PATH_SEARCH_MAX_MS });
    expect(await pathsRefusedWith(rt, batch, all, 'path-ignored')).toBeUndefined();
  });

  it('finds nothing when nothing is refused for that reason', async () => {
    const { rt } = runtime(new Set());
    expect(await pathsRefusedWith(rt, batch, paths(10), 'path-ignored')).toEqual([]);
  });
});
