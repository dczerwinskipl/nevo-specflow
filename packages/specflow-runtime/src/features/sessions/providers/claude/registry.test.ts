import { describe, expect, it, vi } from 'vitest';
import {
  CLAUDE_POLICY_FALLBACK_MS,
  CLAUDE_POLICY_REFRESH_MS,
  CLAUDE_POLICY_RETRY_MS,
  ClaudePolicyCheckError,
  createClaudeRegistryPolicyReader,
  claudeRegistryInspection,
  inspectClaudeRegistry,
  registryInspectionResult,
} from './registry';
it('requires positive policy absence and keeps execution failures distinct from policy presence', () => {
  expect(registryInspectionResult(null, 'absent')).toBe('absent');
  expect(registryInspectionResult(null, 'present')).toBe('present');
  expect(registryInspectionResult(new Error('Timed out'), 'absent')).toBe('unavailable');
  expect(registryInspectionResult(null, 'absent\nunexpected')).toBe('unavailable');
});

it('inspects both hives and both registry views without accepting a missing system executable root', async () => {
  expect(claudeRegistryInspection).toContain('RegistryHive]::LocalMachine');
  expect(claudeRegistryInspection).toContain('RegistryHive]::CurrentUser');
  expect(claudeRegistryInspection).toContain('RegistryView]::Registry64');
  expect(claudeRegistryInspection).toContain('RegistryView]::Registry32');
  expect(claudeRegistryInspection).toContain("'SOFTWARE\\Policies\\ClaudeCode'");
  expect(await inspectClaudeRegistry({ values: {}, sources: {} })).toBe(false);
});

describe('the cached machine policy verdict', () => {
  const environment = { values: {}, sources: {} };
  function reader(
    results: (
      { policy: 'absent' | 'present' } | { policy: 'unavailable'; failure: 'timeout' | 'failed' }
    )[],
  ) {
    let clock = 0;
    const inspect = vi.fn(() => Promise.resolve(results.shift() ?? { policy: 'absent' as const }));
    const sleep = vi.fn(() => Promise.resolve());
    const policy = createClaudeRegistryPolicyReader({ inspect, now: () => clock, sleep });

    return { policy, inspect, sleep, advance: (ms: number) => (clock += ms) };
  }

  it('reads again only for another executable, after the refresh interval or after Check again', async () => {
    const f = reader([
      { policy: 'absent' },
      { policy: 'absent' },
      { policy: 'absent' },
      { policy: 'present' },
    ]);
    expect(await f.policy.read(environment, 'a')).toBe('absent');
    expect(await f.policy.read(environment, 'a')).toBe('absent');
    expect(f.inspect).toHaveBeenCalledTimes(1);
    expect(await f.policy.read(environment, 'b')).toBe('absent');
    f.advance(CLAUDE_POLICY_REFRESH_MS);
    expect(await f.policy.read(environment, 'b')).toBe('absent');
    f.policy.forget();
    expect(await f.policy.read(environment, 'b')).toBe('present');
    expect(f.inspect).toHaveBeenCalledTimes(4);
  });

  it('retries a failed inspection once after a pause', async () => {
    const f = reader([{ policy: 'unavailable', failure: 'timeout' }, { policy: 'absent' }]);
    expect(await f.policy.read(environment, 'a')).toBe('absent');
    expect(f.inspect).toHaveBeenCalledTimes(2);
    expect(f.sleep).toHaveBeenCalledWith(CLAUDE_POLICY_RETRY_MS);
  });

  it('uses a recent verdict when the inspection fails twice, and says what to do once none is recent', async () => {
    const timeout = { policy: 'unavailable', failure: 'timeout' } as const;
    const f = reader([{ policy: 'absent' }, timeout, timeout, timeout, timeout]);
    await f.policy.read(environment, 'a');
    f.advance(CLAUDE_POLICY_REFRESH_MS);
    expect(await f.policy.read(environment, 'a')).toBe('absent');
    f.advance(CLAUDE_POLICY_FALLBACK_MS);
    const refused = f.policy.read(environment, 'a');
    await expect(refused).rejects.toBeInstanceOf(ClaudePolicyCheckError);
    await expect(refused).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      message:
        "SpecFlow could not check Claude's settings on this computer (the check timed out). Try again; if it keeps failing, restart the Runtime.",
      details: { reason: 'claude-policy-check-failed' },
    });
  });

  it('never stands a verdict of another executable in for a failed inspection', async () => {
    const failed = { policy: 'unavailable', failure: 'failed' } as const;
    const f = reader([{ policy: 'absent' }, failed, failed]);
    await f.policy.read(environment, 'a');
    await expect(f.policy.read(environment, 'b')).rejects.toThrow('the check could not run');
  });
});
