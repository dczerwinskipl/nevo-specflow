import { createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { delimiter, isAbsolute, join } from 'node:path';
import type { Invocation } from '../driver';
import { SessionError } from '../../errors';
import {
  createInvocationScope,
  launchOwnedProcess,
  projectProviderEnvironment,
  type ProviderEnvironment,
} from '../process';
import { prepareCodexCredentials, absentCodexPath, regularCodexFile } from './credentials';
import { rpcObject } from './rpc';

export const disabledCodexFeatures = [
  'shell_snapshot',
  'unified_exec_tty',
  'multi_agent',
  'goals',
  'plugins',
  'hooks',
  'apps',
  'browser_use',
  'computer_use',
  'code_mode',
  'code_mode_only',
  'skill_mcp_dependency_install',
  'workspace_dependencies',
] as const;

export function codexArguments(
  workspace: string,
  preflight = false,
  selection?: Invocation['selection'],
): string[] {
  const writing = selection?.mode === 'workspace-write';

  return [
    'app-server',
    '--strict-config',
    ...(preflight ? ['--print-startup-config'] : ['--listen', 'stdio://']),
    '--enable',
    'code_mode_host',
    ...disabledCodexFeatures.flatMap((feature) => ['--disable', feature]),
    ...[
      'cli_auth_credentials_store="file"',
      'model_provider="openai"',
      'sandbox_mode="' + (writing ? 'workspace-write' : 'read-only') + '"',
      'approval_policy="' + (writing ? 'on-request' : 'never') + '"',
      'approvals_reviewer="user"',
      'mcp_servers={}',
      'skills.bundled.enabled=false',
      'web_search="disabled"',
      'windows.sandbox="unelevated"',
      'sandbox_workspace_write.writable_roots=[]',
      'sandbox_workspace_write.network_access=false',
      'sandbox_workspace_write.exclude_tmpdir_env_var=true',
      'sandbox_workspace_write.exclude_slash_tmp=true',
      // Override the whole table: CLI dotted-key parsing does not preserve dots
      // inside quoted Windows paths (for example .codex/worktrees or .nevo).
      'projects={' + JSON.stringify(workspace) + '={trust_level="untrusted"}}',
    ].flatMap((setting) => ['-c', setting]),
  ];
}

function unavailable(): never {
  throw new SessionError(
    'PROVIDER_UNAVAILABLE',
    'Codex installation or managed configuration cannot be verified.',
  );
}

async function fingerprint(executable: string) {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(executable)) {
    bytes += (chunk as Buffer).length;
    if (bytes > 512 * 1024 * 1024) {
      unavailable();
    }

    hash.update(chunk as Buffer);
  }

  return hash.digest('hex');
}

/** Bounded local config discovery. P1 owns this process even if a future CLI
 * stops recognizing the print-only flag; no prompt or model request is sent. */
async function preflight(options: {
  executable: string;
  home: string;
  temporaryRoot: string;
  workspace: string;
  environment: ProviderEnvironment;
  secrets: readonly string[];
  signal: AbortSignal;
}) {
  const invocationId = randomUUID();
  const scope = await createInvocationScope(options.temporaryRoot, invocationId);
  const owner = await launchOwnedProcess({
    ...options,
    invocationId,
    scope,
    cwd: options.workspace,
    args: codexArguments(options.workspace, true),
    signal: AbortSignal.any([options.signal, AbortSignal.timeout(10000)]),
  });
  let bytes = 0;
  const lines: string[] = [];
  try {
    for await (const line of owner.lines()) {
      bytes += Buffer.byteLength(line) + 1;
      if (bytes > 1024 * 1024) {
        unavailable();
      }

      lines.push(line);
    }

    const exit = await owner.done;
    if (exit.code !== 0) {
      unavailable();
    }

    const value = rpcObject(JSON.parse(lines.join('\n')));
    if (rpcObject(value.configRequirements).requirements !== null) {
      unavailable();
    }

    const version =
      typeof value.appServerVersion === 'string' &&
      /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(value.appServerVersion) &&
      value.appServerVersion.length <= 128
        ? value.appServerVersion
        : undefined;

    return { version };
  } finally {
    if ((await owner.dispose()).process.state !== 'stopped') {
      unavailable();
    }
  }
}

export async function inspectCodexInstallation(options: {
  executable?: string;
  workspace: string;
  homeRoot: string;
  temporaryRoot: string;
  signal: AbortSignal;
  environment?: ProviderEnvironment;
}) {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    unavailable();
  }

  const base =
    options.environment ??
    projectProviderEnvironment({ host: process.env, inherit: ['PROGRAMDATA'] });
  if (
    Object.keys(base.values).some(
      (key) =>
        ![
          'PATH',
          'PATHEXT',
          'SYSTEMROOT',
          'WINDIR',
          'USERPROFILE',
          'APPDATA',
          'LOCALAPPDATA',
          'TEMP',
          'TMP',
          'PROGRAMDATA',
        ].includes(key),
    )
  ) {
    unavailable();
  }

  if (
    !isAbsolute(options.workspace) ||
    options.workspace.includes('\0') ||
    !base.values.USERPROFILE
  ) {
    unavailable();
  }

  try {
    let executable = options.executable;
    if (!executable) {
      for (const path of (base.values.PATH ?? '').split(delimiter)) {
        const candidate = join(path.replace(/^"|"$/g, ''), 'codex.exe');
        try {
          await regularCodexFile(candidate, 512 * 1024 * 1024);
          executable = candidate;
          break;
        } catch {
          /* Continue native executable discovery. */
        }
      }
    }

    if (!executable || !isAbsolute(executable)) {
      unavailable();
    }

    await regularCodexFile(executable, 512 * 1024 * 1024);
    const sha256 = await fingerprint(executable);
    const machine = join(base.values.PROGRAMDATA ?? 'C:\\ProgramData', 'OpenAI', 'Codex');
    for (const name of ['requirements.toml', 'config.toml', 'managed_config.toml']) {
      await absentCodexPath(join(machine, name));
    }

    const credentials = await prepareCodexCredentials(
      base.values.USERPROFILE,
      options.homeRoot,
      options.workspace,
    );
    const environment: ProviderEnvironment = {
      values: Object.freeze({ ...base.values, CODEX_HOME: credentials.home }),
      sources: Object.freeze({ ...base.sources, CODEX_HOME: 'configured' }),
    };
    options.signal.throwIfAborted();
    const metadata = await preflight({ ...options, ...credentials, executable, environment });

    return {
      ...credentials,
      executable,
      environment,
      sha256,
      ...metadata,
      platform: 'win32' as const,
      architecture: 'x64' as const,
      fingerprint: createHash('sha256')
        .update(
          JSON.stringify({
            sha256,
            executable,
            home: credentials.home,
            scope: credentials.accountScope,
            authentication: credentials.authenticationFingerprint,
            environment: environment.values,
            workspace: options.workspace,
            profile: 'codex-app-server-v2',
          }),
        )
        .digest('hex'),
    };
  } catch (error) {
    if (error instanceof SessionError) {
      throw error;
    }

    return unavailable();
  }
}
