import { isAbsolute, join } from 'node:path';

/** Native hooks accept a command string. Only fixed executable paths and a fixed
 * hook role enter this encoded script; native tool input travels through stdin. */
export function antigravityHooks(options: { systemRoot: string; node: string; helper: string }) {
  if (
    [options.systemRoot, options.node, options.helper].some(
      (path) => !isAbsolute(path) || /[\0\r\n]/.test(path),
    )
  ) {
    throw new Error('Absolute native hook executable paths are required.');
  }

  const executable = join(
    options.systemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  // The native launcher does not reliably unquote executable names. The fixed
  // Windows system executable must therefore be representable without quoting.
  if (/\s|["']/.test(executable)) {
    throw new Error('Unsupported Windows hook launcher path.');
  }

  const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'";
  const argument = (value: string) =>
    '"' + value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1') + '"';
  function command(hook: 'pre-tool-use' | 'stop') {
    const script = `
$ErrorActionPreference = 'Stop'
$OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = $OutputEncoding
[Console]::OutputEncoding = $OutputEncoding
try {
$buffer = [char[]]::new(4096)
$inputText = [Text.StringBuilder]::new()
while (($count = [Console]::In.Read($buffer, 0, $buffer.Length)) -gt 0) {
  if (($inputText.Length + $count) -gt 65536) { throw 'Input limit' }
  $null = $inputText.Append($buffer, 0, $count)
}
$json = $inputText.ToString()
if ([Text.Encoding]::UTF8.GetByteCount($json) -gt 65536) { throw 'Input limit' }
$start = [Diagnostics.ProcessStartInfo]::new()
$start.FileName = ${literal(options.node)}
$start.Arguments = ${literal(argument(options.helper) + ' ' + argument(hook))}
$start.UseShellExecute = $false
$start.CreateNoWindow = $true
$start.RedirectStandardInput = $true
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
$helperProcess = [Diagnostics.Process]::new()
$helperProcess.StartInfo = $start
if (-not $helperProcess.Start()) { throw 'Helper unavailable' }
# PowerShell 5 native pipelines can wait indefinitely on redirected handles.
# Read both native byte streams directly; no PowerShell pipeline owns this child.
$outputBytes = [byte[]]::new(4097)
$errorBytes = [byte[]]::new(4097)
$outputCount = 0
$errorCount = 0
$outputRead = $helperProcess.StandardOutput.BaseStream.ReadAsync($outputBytes, 0, $outputBytes.Length)
$errorRead = $helperProcess.StandardError.BaseStream.ReadAsync($errorBytes, 0, $errorBytes.Length)
$clock = [Diagnostics.Stopwatch]::StartNew()
$budget = ${hook === 'stop' ? 9000 : 1805000}
$bytes = [Text.Encoding]::UTF8.GetBytes($json)
$inputWrite = $helperProcess.StandardInput.BaseStream.WriteAsync($bytes, 0, $bytes.Length)
while ($null -ne $inputWrite -or $null -ne $outputRead -or $null -ne $errorRead) {
  $remaining = $budget - $clock.ElapsedMilliseconds
  if ($remaining -le 0) { throw 'Helper timeout' }
  $reads = [Collections.Generic.List[Threading.Tasks.Task]]::new()
  if ($null -ne $inputWrite) { $reads.Add($inputWrite) }
  if ($null -ne $outputRead) { $reads.Add($outputRead) }
  if ($null -ne $errorRead) { $reads.Add($errorRead) }
  if ([Threading.Tasks.Task]::WaitAny($reads.ToArray(), [int]$remaining) -lt 0) { throw 'Helper timeout' }
  if ($null -ne $inputWrite -and $inputWrite.IsCompleted) {
    $inputWrite.Wait()
    $helperProcess.StandardInput.Close()
    $inputWrite = $null
  }
  if ($null -ne $outputRead -and $outputRead.IsCompleted) {
    $count = $outputRead.Result
    $outputCount += $count
    if ($outputCount -gt 4096) { throw 'Helper output limit' }
    if ($count -eq 0) { $outputRead = $null }
    else { $outputRead = $helperProcess.StandardOutput.BaseStream.ReadAsync($outputBytes, $outputCount, $outputBytes.Length - $outputCount) }
  }
  if ($null -ne $errorRead -and $errorRead.IsCompleted) {
    $count = $errorRead.Result
    $errorCount += $count
    if ($errorCount -gt 4096) { throw 'Helper error limit' }
    if ($count -eq 0) { $errorRead = $null }
    else { $errorRead = $helperProcess.StandardError.BaseStream.ReadAsync($errorBytes, $errorCount, $errorBytes.Length - $errorCount) }
  }
}
$remaining = $budget - $clock.ElapsedMilliseconds
if ($remaining -le 0 -or -not $helperProcess.WaitForExit([int]$remaining)) { throw 'Helper timeout' }
if ($helperProcess.ExitCode -ne 0) { throw 'Helper unavailable' }
$utf8 = [Text.UTF8Encoding]::new($false, $true)
[Console]::Out.WriteLine($utf8.GetString($outputBytes, 0, $outputCount))
} catch {
  if ($null -ne $helperProcess) {
    try {
      if (-not $helperProcess.HasExited) {
        $helperProcess.Kill()
        if (-not $helperProcess.WaitForExit(1000)) { exit 1 }
      }
    } catch { exit 1 }
  }
  [Console]::Out.WriteLine('{"decision":"deny"}')
} finally {
  if ($null -ne $helperProcess) { $helperProcess.Dispose() }
}
`;

    return (
      executable +
      ' -NoProfile -NonInteractive -EncodedCommand ' +
      Buffer.from(script, 'utf16le').toString('base64')
    );
  }

  return {
    'specflow-managed-invocation': {
      PreToolUse: [
        {
          matcher: '*',
          hooks: [{ type: 'command', command: command('pre-tool-use'), timeout: 1810 }],
        },
      ],
      Stop: [{ type: 'command', command: command('stop'), timeout: 10 }],
    },
  };
}
