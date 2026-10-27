import { execFile } from 'node:child_process';
import { isAbsolute, join } from 'node:path';
import type { ProviderEnvironment } from '../process';

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
export function registryInspectionResult(
  error: Error | null,
  stdout: string,
): ClaudeRegistryPolicy {
  if (error) return 'unavailable';
  if (stdout === 'absent') return 'absent';
  if (stdout === 'present') return 'present';
  return 'unavailable';
}
export async function inspectClaudeRegistryPolicy(
  environment: ProviderEnvironment,
): Promise<ClaudeRegistryPolicy> {
  const systemRoot = environment.values.SYSTEMROOT;
  if (!systemRoot || !isAbsolute(systemRoot)) return 'unavailable';
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
      (error, stdout) => resolveInspection(registryInspectionResult(error, stdout)),
    );
  });
}
export async function inspectClaudeRegistry(environment: ProviderEnvironment): Promise<boolean> {
  return (await inspectClaudeRegistryPolicy(environment)) === 'absent';
}
