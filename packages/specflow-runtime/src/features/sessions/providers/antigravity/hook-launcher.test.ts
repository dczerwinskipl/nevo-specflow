import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { antigravityHooks } from './hook-launcher';

describe('Antigravity fixed hook launcher', () => {
  it('encodes trusted paths literally and carries native input only through bounded stdin', () => {
    const hooks = antigravityHooks({
      systemRoot: resolve('Windows'),
      node: resolve("Node directory's/node.exe"),
      helper: resolve("Helper directory's/antigravity-hook.js"),
    })['specflow-managed-invocation'];
    const pre = hooks.PreToolUse[0]!;
    const command = pre.hooks[0]!.command;
    const encoded = command.split(' -EncodedCommand ')[1]!;
    const script = Buffer.from(encoded, 'base64').toString('utf16le');
    expect(pre.matcher).toBe('*');
    expect(script).toContain("directory''s");
    expect(script).toContain("'pre-tool-use'");
    expect(script).toContain('UTF8.GetByteCount($json) -gt 65536');
    expect(script).toContain('"decision":"deny"');
    const stop = Buffer.from(
      hooks.Stop[0]!.command.split(' -EncodedCommand ')[1]!,
      'base64',
    ).toString('utf16le');
    expect(stop).toContain("'stop'");
  });

  it('rejects ambiguous system launcher paths and control characters', () => {
    expect(() =>
      antigravityHooks({
        systemRoot: resolve('Windows directory'),
        node: resolve('node'),
        helper: resolve('helper'),
      }),
    ).toThrow();
    expect(() =>
      antigravityHooks({
        systemRoot: resolve('Windows'),
        node: resolve('node\nextra'),
        helper: resolve('helper'),
      }),
    ).toThrow();
  });
});
