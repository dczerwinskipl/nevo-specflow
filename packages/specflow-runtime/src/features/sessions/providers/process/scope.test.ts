import { mkdtemp, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createInvocationScope } from './scope';
describe('provider resource scope', () => {
  it('unwinds resources once in reverse order and continues after a cleanup failure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'provider-scope-'));
    try {
      const scope = await createInvocationScope(root, randomUUID());
      const order: string[] = [];
      await scope.temporaryFile('mcp.json', '{}');
      scope.defer('mcp', () => {
        order.push('mcp');
        return Promise.resolve();
      });
      scope.defer('transport', () => {
        order.push('transport');
        return Promise.reject(new Error('private cause'));
      });
      const [one, two] = await Promise.all([scope.close(), scope.close()]);
      expect(order).toEqual(['transport', 'mcp']);
      expect(one).toEqual([{ resource: 'transport', code: 'CLEANUP_FAILED' }]);
      expect(two).toBe(one);
      await expect(access(scope.directory)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('rejects unsafe temporary names and retains files while process settlement is unproven', async () => {
    const root = await mkdtemp(join(tmpdir(), 'provider-scope-'));
    try {
      const scope = await createInvocationScope(root, randomUUID());
      for (const name of ['../outside.json', 'CON.json', 'nested/file.json'])
        await expect(scope.temporaryFile(name, '{}')).rejects.toThrow();
      const file = await scope.temporaryFile('mcp.json', '{}');
      expect(await scope.close(false)).toEqual([
        { resource: 'temporary-files', code: 'PROCESS_NOT_STOPPED' },
      ]);
      await expect(access(file)).resolves.toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
