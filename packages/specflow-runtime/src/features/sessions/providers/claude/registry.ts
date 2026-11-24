import { execFile } from 'node:child_process';
import { isAbsolute, join } from 'node:path';
import type { ProviderEnvironment } from '../process';
import { SessionError } from '../../errors';

export const claudeRegistryInspection = `
$ErrorActionPreference = 'Stop'
$hives = @(
  [Microsoft.Win32.RegistryHive]::LocalMachine,
  [Microsoft.Win32.RegistryHive]::CurrentUser
)
$views = @(
  [Microsoft.Win32.RegistryView]::Registry64,
  [Microsoft.Win32.RegistryView]::Registry32
)
foreach ($hive in $hives) {
  foreach ($view in $views) {
    $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey($hive, $view)
    try {
      $policy = $base.OpenSubKey('SOFTWARE\\Policies\\ClaudeCode')
      if ($null -ne $policy) {
        $policy.Dispose()
        [Console]::Write('present')
        exit 0
      }
    } finally {
      $base.Dispose()
    }
  }
}
[Console]::Write('absent')
`;

export type ClaudeRegistryPolicy = 'absent' | 'present' | 'unavailable';
/** Why an inspection gave no verdict: it ran out of time, or it could not run or answer. */
export type ClaudeRegistryFailure = 'timeout' | 'failed';
export function registryInspectionResult(
  error: Error | null,
  stdout: string,
): ClaudeRegistryPolicy {
  if (error) {
    return 'unavailable';
  }

  if (stdout === 'absent') {
    return 'absent';
  }

  if (stdout === 'present') {
    return 'present';
  }

  return 'unavailable';
}

/**
 * One PowerShell process reads both hives in both views. Measured under load it costs about as much
 * as one reg.exe query (four would be needed), and it answers with an exact marker instead of
 * localized reg.exe output; its result is cached (see {@link createClaudeRegistryPolicyReader}).
 */
export async function inspectClaudeRegistryPolicy(
  environment: ProviderEnvironment,
): Promise<ClaudeRegistryPolicy> {
  return (await inspectRegistry(environment)).policy;
}

async function inspectRegistry(
  environment: ProviderEnvironment,
): Promise<{ policy: ClaudeRegistryPolicy; failure?: ClaudeRegistryFailure }> {
  const systemRoot = environment.values.SYSTEMROOT;
  if (!systemRoot || !isAbsolute(systemRoot)) {
    return { policy: 'unavailable', failure: 'failed' };
  }

  return new Promise((resolveInspection) => {
    execFile(
      join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', claudeRegistryInspection],
      {
        shell: false,
        windowsHide: true,
        // Cold PowerShell startup under native CLI/AV load can exceed two seconds.
        // Keep a finite budget and require the exact positive absence marker.
        timeout: 5000,
        maxBuffer: 4096,
        env: { ...environment.values },
      },
      (error, stdout) => {
        const policy = registryInspectionResult(error, stdout);
        resolveInspection(
          policy === 'unavailable'
            ? { policy, failure: error?.killed || error?.signal ? 'timeout' : 'failed' }
            : { policy },
        );
      },
    );
  });
}

export async function inspectClaudeRegistry(environment: ProviderEnvironment): Promise<boolean> {
  return (await inspectClaudeRegistryPolicy(environment)) === 'absent';
}

/** How long a verdict is reused for the same executable: the probe's refresh interval. */
export const CLAUDE_POLICY_REFRESH_MS = 15 * 60_000;
/** How long the last verdict stands in for an inspection that failed twice. */
export const CLAUDE_POLICY_FALLBACK_MS = 60 * 60_000;
/** The wait before the one retry of a failed inspection. */
export const CLAUDE_POLICY_RETRY_MS = 1000;

/** The inspection gave no verdict twice and no recent one exists: the owner tries again. */
export class ClaudePolicyCheckError extends SessionError {
  readonly failure: ClaudeRegistryFailure;
  constructor(failure: ClaudeRegistryFailure) {
    super(
      'PROVIDER_UNAVAILABLE',
      "SpecFlow could not check Claude's settings on this computer (" +
        (failure === 'timeout' ? 'the check timed out' : 'the check could not run') +
        '). Try again; if it keeps failing, restart the Runtime.',
      { reason: 'claude-policy-check-failed' },
    );
    this.name = 'ClaudePolicyCheckError';
    this.failure = failure;
  }
}

/**
 * The machine policy verdict, read on the probe's triggers only: when the executable's identity
 * changed, when the verdict is older than {@link CLAUDE_POLICY_REFRESH_MS}, or after `forget` (the
 * owner's Check again). A failed inspection is retried once; if it fails again, the last verdict
 * stands in when it is younger than {@link CLAUDE_POLICY_FALLBACK_MS}, otherwise the check fails.
 */
export function createClaudeRegistryPolicyReader(
  dependencies: {
    inspect?: typeof inspectRegistry;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
) {
  const inspect = dependencies.inspect ?? inspectRegistry;
  const now = dependencies.now ?? Date.now;
  const sleep =
    dependencies.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let last: { identity: string; policy: 'absent' | 'present'; at: number } | undefined;
  let fresh = false;

  return {
    async read(environment: ProviderEnvironment, identity: string): Promise<'absent' | 'present'> {
      if (
        last &&
        !fresh &&
        last.identity === identity &&
        now() - last.at < CLAUDE_POLICY_REFRESH_MS
      ) {
        return last.policy;
      }

      let result = await inspect(environment);
      if (result.policy === 'unavailable') {
        await sleep(CLAUDE_POLICY_RETRY_MS);
        result = await inspect(environment);
      }

      if (result.policy !== 'unavailable') {
        last = { identity, policy: result.policy, at: now() };
        fresh = false;

        return result.policy;
      }

      if (last?.identity === identity && now() - last.at < CLAUDE_POLICY_FALLBACK_MS) {
        return last.policy;
      }

      throw new ClaudePolicyCheckError(result.failure ?? 'failed');
    },
    /** The next read inspects again (Check again); a failed one still falls back. */
    forget() {
      fresh = true;
    },
  };
}

export const claudeRegistryPolicy = createClaudeRegistryPolicyReader();
