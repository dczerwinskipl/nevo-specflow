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
$result = $json | & ${literal(options.node)} ${literal(options.helper)} ${literal(hook)} 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Helper unavailable' }
[Console]::Out.WriteLine($result)
} catch {
  [Console]::Out.WriteLine('{"decision":"deny"}')
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
