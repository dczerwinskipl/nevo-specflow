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

export async function inspectClaudeRegistry(environment: ProviderEnvironment): Promise<boolean> {
  const systemRoot = environment.values.SYSTEMROOT;
  if (!systemRoot || !isAbsolute(systemRoot)) return false;
  return new Promise((resolveInspection) => {
    execFile(
      join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', claudeRegistryInspection],
      {
        shell: false,
        windowsHide: true,
        timeout: 2000,
        maxBuffer: 4096,
        env: { ...environment.values },
      },
      (error, stdout) => resolveInspection(!error && stdout === 'absent'),
    );
  });
}
