import { describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createInvocationScope, launchOwnedProcess, projectProviderEnvironment } from '../process';
import { antigravityHooks } from './hook-launcher';

describe('Antigravity fixed hook launcher', () => {
  it.runIf(process.platform === 'win32')(
    'forwards UTF-8 through the Windows launcher and explicitly denies helper startup failure',
    async () => {
      const root = await mkdtemp(join(tmpdir(), "specflow-hook path's-"));
      try {
        for (const available of [true, false]) {
          const invocationId = randomUUID();
          const scope = await createInvocationScope(root, invocationId);
          const helper = join(scope.directory, "controlled helper's.cjs");
          if (available) {
            await writeFile(
              helper,
              `
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  const valid = JSON.parse(input).text === 'Zażółć — test';
  process.stdout.write(JSON.stringify({decision: valid ? 'allow' : 'deny'}));
});
`,
            );
          }

          const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT!;
          const command = antigravityHooks({ systemRoot, node: process.execPath, helper })[
            'specflow-managed-invocation'
          ].PreToolUse[0]!.hooks[0]!.command;
          const owner = await launchOwnedProcess({
            invocationId,
            scope,
            executable: join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
            args: [
              '-NoProfile',
              '-NonInteractive',
              '-EncodedCommand',
              command.split(' -EncodedCommand ')[1]!,
            ],
            cwd: root,
            environment: projectProviderEnvironment({ host: process.env }),
            signal: AbortSignal.timeout(10000),
          });
          try {
            await owner.write(JSON.stringify({ text: 'Zażółć — test' }));
            await owner.endInput();
            const lines: string[] = [];
            for await (const line of owner.lines()) {
              lines.push(line);
            }

            expect(lines.map((line): unknown => JSON.parse(line))).toEqual([
              { decision: available ? 'allow' : 'deny' },
            ]);
            expect((await owner.done).code).toBe(0);
          } finally {
            expect((await owner.dispose()).process.state).toBe('stopped');
          }
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

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
