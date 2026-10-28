import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { probeCodexBoundary } from './boundary';

it.each(['enforced', 'outside-write', 'not-started', 'readonly-write'] as const)(
  'requires actual execution and both positive/negative write controls: %s',
  async (behavior) => {
    const root = await mkdtemp(join(tmpdir(), 'codex-boundary-'));
    try {
      const result = await probeCodexBoundary(
        {
          async request(method, params) {
            expect(method).toBe('command/exec');
            const command = params.command as string[];
            const target = command.at(-1)!;
            const sandbox = params.sandboxPolicy as { type: string; networkAccess: boolean };
            expect(sandbox.networkAccess).toBe(false);
            if (behavior === 'not-started') return { exitCode: 23, stdout: 'denied' };
            const permitted =
              sandbox.type === 'workspaceWrite' && !target.endsWith('outside-write-root.txt');
            const escaped =
              behavior === 'outside-write' && target.endsWith('outside-write-root.txt');
            if (
              permitted ||
              escaped ||
              (behavior === 'readonly-write' && sandbox.type === 'readOnly')
            ) {
              await writeFile(target, 'specflow-probe');
              return { exitCode: 42, stdout: 'specflow-probe-start\nwritten' };
            }
            return { exitCode: 23, stdout: 'specflow-probe-start\ndenied' };
          },
        },
        root,
        new AbortController().signal,
      );
      expect(result).toEqual({
        readOnly: behavior === 'enforced' || behavior === 'outside-write',
        write: behavior === 'enforced' || behavior === 'readonly-write',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
