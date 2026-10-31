import { describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createInvocationScope, launchOwnedProcess, projectProviderEnvironment } from '../process';
import { antigravityHooks } from './hook-launcher';
import { createDiagnosticStore } from '../process/diagnostics';

const launchDeadlineMs = 10000;
const settlementBudgetMs = 5000;

describe('Antigravity fixed hook launcher', () => {
  it.runIf(process.platform === 'win32').each([true, false])(
    'forwards UTF-8 through the Windows launcher or denies startup failure (helper available: %s)',
    async (available) => {
      const root = await mkdtemp(join(tmpdir(), "specflow-hook path's-"));
      try {
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
        const diagnostics = createDiagnosticStore({
          enabled: true,
          maxInvocationBytes: 4096,
          maxTotalBytes: 4096,
        });
        let phase = 'launch';
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
          signal: AbortSignal.timeout(launchDeadlineMs),
          diagnostics,
        });
        try {
          phase = 'write';
          await owner.write(JSON.stringify({ text: 'Zażółć — test' }));
          phase = 'end-input';
          await owner.endInput();
          phase = 'read-output';
          const lines: string[] = [];
          for await (const line of owner.lines()) {
            lines.push(line);
          }

          expect(lines.map((line): unknown => JSON.parse(line))).toEqual([
            { decision: available ? 'allow' : 'deny' },
          ]);
          expect((await owner.done).code).toBe(0);
        } catch (error) {
          throw new Error(
            `Controlled hook launcher failed during ${phase}: ${diagnostics.read(invocationId)?.text ?? 'no native phase observed'}`,
            { cause: error },
          );
        } finally {
          expect((await owner.dispose()).process.state).toBe('stopped');
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    // Let the bounded operation abort and settle before the test harness interrupts cleanup.
    launchDeadlineMs + settlementBudgetMs,
  );

  it.runIf(process.platform === 'win32').each(['stdout', 'stderr', 'blocked-input'] as const)(
    'denies and stops an oversized or stalled helper: %s',
    async (failure) => {
      const root = await mkdtemp(join(tmpdir(), "specflow-hook failure's-"));
      try {
        const invocationId = randomUUID();
        const scope = await createInvocationScope(root, invocationId);
        const helper = join(scope.directory, "controlled failure's.cjs");
        const script =
          failure === 'blocked-input'
            ? 'setInterval(() => undefined, 1000);'
            : `process.${failure}.write(Buffer.alloc(65536, 120)); setInterval(() => undefined, 1000);`;
        await writeFile(helper, script);
        const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT!;
        const command = antigravityHooks({ systemRoot, node: process.execPath, helper })[
          'specflow-managed-invocation'
        ].Stop[0]!.command;
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
          signal: AbortSignal.timeout(12000),
        });
        try {
          // Exceeds a native pipe buffer: a helper that never reads must not
          // block the launcher before its own Stop deadline is observed.
          await owner.write(JSON.stringify({ text: 'x'.repeat(60000) }));
          await owner.endInput();
          const lines: string[] = [];
          for await (const line of owner.lines()) {
            lines.push(line);
          }

          expect(lines.map((line): unknown => JSON.parse(line))).toEqual([{ decision: 'deny' }]);
          expect((await owner.done).code).toBe(0);
          const stopped = await owner.dispose();
          expect(stopped.process).toEqual({ state: 'stopped', reason: 'group-exited' });
        } finally {
          expect((await owner.dispose()).process.state).toBe('stopped');
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    17000,
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
    expect(script).toContain('"pre-tool-use"');
    expect(script).toContain('UTF8.GetByteCount($json) -gt 65536');
    expect(script).toContain('"decision":"deny"');
    expect(script).toContain('$start.UseShellExecute = $false');
    expect(script).toContain('BaseStream.WriteAsync');
    expect(script).not.toContain('$json | &');
    const stop = Buffer.from(
      hooks.Stop[0]!.command.split(' -EncodedCommand ')[1]!,
      'base64',
    ).toString('utf16le');
    expect(stop).toContain('"stop"');
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

  it('escapes Windows argument quotes and terminal backslashes independently of PowerShell literals', () => {
    const helper = resolve('controlled helper') + '\\';
    const command = antigravityHooks({
      systemRoot: resolve('Windows'),
      node: resolve('node'),
      helper,
    })['specflow-managed-invocation'].PreToolUse[0]!.hooks[0]!.command;
    const script = Buffer.from(command.split(' -EncodedCommand ')[1]!, 'base64').toString(
      'utf16le',
    );
    expect(script).toContain(String.raw`controlled helper\\" "pre-tool-use"`);
    const quotedHelper = resolve('controlled"helper');
    const quoted = antigravityHooks({
      systemRoot: resolve('Windows'),
      node: resolve('node'),
      helper: quotedHelper,
    })['specflow-managed-invocation'].PreToolUse[0]!.hooks[0]!.command;
    expect(
      Buffer.from(quoted.split(' -EncodedCommand ')[1]!, 'base64').toString('utf16le'),
    ).toContain(String.raw`controlled\"helper`);
  });
});
