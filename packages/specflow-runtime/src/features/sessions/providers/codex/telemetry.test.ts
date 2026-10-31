import { describe, expect, it } from 'vitest';
import { codexLimitWindows, readCodexLimits } from './telemetry';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { disabledCodexFeatures } from './installation';

describe('Codex native account telemetry normalization', () => {
  it('performs initialization and account reads without sending any thread or turn command', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-telemetry-'));
    const methods: string[] = [];
    const replies: string[] = [];
    let ended = false;
    let wake: (() => void) | undefined;
    let closed = false;
    try {
      const options = {
        workspace: root,
        temporaryRoot: root,
        home: resolve('synthetic-private-home'),
        executable: resolve('controlled-never-executed.exe'),
        accountScope: 'synthetic-account',
        authenticationFingerprint: 'synthetic-login',
        secrets: [],
        sha256: 'x',
        fingerprint: 'x',
        version: '9.0',
        platform: 'win32' as const,
        architecture: 'x64' as const,
        environment: { values: {}, sources: {} },
        signal: new AbortController().signal,
      };
      const result = await readCodexLimits(options, (launch) =>
        Promise.resolve({
          write(line) {
            const message = JSON.parse(line) as { method: string; id?: number };
            methods.push(message.method);
            if (message.id === undefined) {
              return Promise.resolve();
            }

            const responses: Record<string, unknown> = {
              initialize: { userAgent: 'controlled', codexHome: options.home },
              'configRequirements/read': { requirements: null },
              'experimentalFeature/list': {
                data: [
                  { name: 'code_mode_host', enabled: true },
                  ...disabledCodexFeatures.map((name) => ({ name, enabled: false })),
                ],
              },
              'mcpServerStatus/list': { data: [] },
              'account/read': { account: { type: 'chatgpt' } },
              'account/rateLimits/read': { rateLimits: { primary: { usedPercent: 12 } } },
            };
            expect(Object.hasOwn(responses, message.method)).toBe(true);
            replies.push(JSON.stringify({ id: message.id, result: responses[message.method] }));
            wake?.();

            return Promise.resolve();
          },
          async *lines() {
            while (!ended) {
              if (!replies.length) {
                await new Promise<void>((resolve) => {
                  wake = resolve;
                });
              }

              wake = undefined;
              const reply = replies.shift();
              if (reply !== undefined) {
                yield reply;
              }
            }
          },
          async dispose() {
            closed = true;
            ended = true;
            wake?.();
            await launch.scope.close();

            return { process: { state: 'stopped', reason: 'group-exited' }, cleanup: [] };
          },
        }),
      );
      expect(result[0]).toMatchObject({ used: '12', unit: 'percent' });
      expect(methods).not.toContain('thread/start');
      expect(methods).not.toContain('thread/resume');
      expect(methods).not.toContain('turn/start');
      expect(closed).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('keeps native windows separate, prefers multibucket data and drops labels/credits', () => {
    const windows = codexLimitWindows({
      rateLimits: { primary: { usedPercent: 99 } },
      rateLimitsByLimitId: {
        privateLabel: {
          limitName: 'private account label',
          credits: { balance: 'secret' },
          primary: { usedPercent: 25, windowDurationMins: 15, resetsAt: 1730947200 },
          secondary: { usedPercent: 12.5 },
        },
      },
    });
    expect(windows).toEqual([
      {
        windowId: expect.any(String) as string,
        scope: 'account',
        unit: 'percent',
        used: '25',
        windowSeconds: 900,
        resetsAt: '2024-11-07T02:40:00.000Z',
      },
      { windowId: expect.any(String) as string, scope: 'account', unit: 'percent', used: '12.5' },
    ]);
    expect(windows[0]!.windowId).not.toBe(windows[1]!.windowId);
    expect(JSON.stringify(windows)).not.toMatch(/private|secret|credits/);
  });

  it.each([-1, 101, NaN, '20'])(
    'rejects invalid native percentages instead of clamping: %s',
    (usedPercent) => {
      expect(() => codexLimitWindows({ rateLimits: { primary: { usedPercent } } })).toThrow();
    },
  );
  it.each([
    [1e-13, '0.000000000001'],
    [1e-7, '0.0000001'],
    [0.1234567890123, '0.123456789013'],
    [99.99999999999999, '100.000000000000'],
  ])('normalizes finite percentage %s with conservative decimal resolution', (native, expected) => {
    expect(codexLimitWindows({ rateLimits: { primary: { usedPercent: native } } })[0]?.used).toBe(
      expected,
    );
  });
  it('keeps absent windows unavailable and rejects unbounded window collections', () => {
    expect(() => codexLimitWindows({ rateLimits: { primary: null, secondary: null } })).toThrow(
      'not reported',
    );
    expect(() =>
      codexLimitWindows({
        rateLimitsByLimitId: Object.fromEntries(
          Array.from({ length: 9 }, (_, i) => [String(i), {}]),
        ),
      }),
    ).toThrow();
  });
});
