import { realpath, lstat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { validateDriverFact } from '../facts';
import { validateAntigravityFileArguments } from './tool-arguments';
import type { DriverFact } from '../../persistence/protocol';
import { prepareMcpQuestion, McpQuestionEndpoint } from '../../interactions/mcp/questions';

export interface AntigravityPermissionContext {
  nativeSessionId: string;
  workspace: string;
  writable: boolean;
  commandsAllowed?: boolean;
}
export interface NativeHookDecision {
  decision: 'allow' | 'deny';
}
type Permission = Extract<DriverFact, { kind: 'interaction' }>['interaction'] & {
  kind: 'permission';
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid native hook input.');
  }

  return value as Record<string, unknown>;
}

/** Hook metadata correlates to the Runtime-owned operation, never caller-selected Session IDs. */
export function validateAntigravityHookBinding(
  input: unknown,
  context: AntigravityPermissionContext,
) {
  const body = record(input);
  if (
    body.conversationId !== context.nativeSessionId ||
    !Array.isArray(body.workspacePaths) ||
    body.workspacePaths.length !== 1 ||
    typeof body.workspacePaths[0] !== 'string' ||
    !isAbsolute(body.workspacePaths[0]) ||
    relative(resolve(body.workspacePaths[0]), resolve(context.workspace)) !== ''
  ) {
    throw new Error('Native hook operation binding mismatch.');
  }

  return body;
}

function inside(root: string, path: string) {
  const suffix = relative(root, path);

  return (
    suffix === '' || (!isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith('..' + sep))
  );
}

function executionConfiguration(root: string, target: string) {
  const parts = relative(root, target).split(sep);
  const normalize = (value: string | undefined) =>
    process.platform === 'win32' ? value?.toLowerCase() : value;

  return (
    normalize(parts[0]) === '.agents' &&
    ['hooks.json', 'mcp_config.json', 'plugins', 'sidecars', 'projects'].includes(
      normalize(parts[1]) ?? '',
    )
  );
}

async function physicalInRoot(
  workspace: string,
  target: unknown,
  directory = false,
  writable = false,
) {
  if (typeof target !== 'string' || !isAbsolute(target) || target.includes('\0')) {
    throw new Error('Native tool requires an absolute workspace path.');
  }

  if (
    process.platform === 'win32' &&
    relative(workspace, resolve(target))
      .split(sep)
      .some((part) => /[ .]$|:/.test(part))
  ) {
    // NTFS alternate streams and Win32 trailing-dot/space aliases must not
    // bypass the physical target and active-configuration path checks.
    throw new Error('Unsupported native Windows path alias.');
  }

  const root = await realpath(workspace);
  if (!inside(root, resolve(target))) {
    throw new Error('Native tool target is outside the workspace.');
  }

  let existing = resolve(target);
  for (;;) {
    try {
      // realpath reports ENOENT for a dangling link. Do not mistake that for a
      // safely absent file and ascend past a link that a native write follows.
      if ((await lstat(existing)).isSymbolicLink()) {
        throw new Error('Native tool target traverses a symbolic link.');
      }

      const physical = await realpath(existing);
      if (!inside(root, physical)) {
        throw new Error('Native tool target escapes the workspace.');
      }

      if (
        writable &&
        executionConfiguration(root, resolve(physical, relative(existing, resolve(target))))
      ) {
        throw new Error('Native tool cannot change active execution configuration.');
      }

      if (directory && !(await lstat(existing)).isDirectory()) {
        throw new Error('Native command directory unavailable.');
      }

      return;
    } catch (error) {
      if (
        directory ||
        !error ||
        typeof error !== 'object' ||
        !('code' in error) ||
        error.code !== 'ENOENT'
      ) {
        throw error;
      }

      const parent = dirname(existing);
      if (parent === existing) {
        throw new Error('Native tool target unavailable.', { cause: error });
      }

      existing = parent;
    }
  }
}

export async function prepareAntigravityPermission(
  input: unknown,
  context: AntigravityPermissionContext,
): Promise<{
  step: number;
  decision: NativeHookDecision;
  interaction?: Permission;
  revalidate(): Promise<void>;
}> {
  const body = validateAntigravityHookBinding(input, context);
  if (!Number.isSafeInteger(body.stepIdx) || (body.stepIdx as number) < 0) {
    throw new Error('Invalid native tool step.');
  }

  const tool = record(body.toolCall);
  const args = record(tool.args);
  const fields = Object.keys(args);
  const step = body.stepIdx as number;
  if (tool.name === 'call_mcp_tool') {
    const expected = ['Arguments', 'ServerName', 'ToolName', 'toolAction', 'toolSummary'];
    if (
      fields.length !== expected.length ||
      !fields.every((key) => expected.includes(key)) ||
      args.ServerName !== McpQuestionEndpoint.serverName ||
      args.ToolName !== McpQuestionEndpoint.toolName ||
      typeof args.toolAction !== 'string' ||
      typeof args.toolSummary !== 'string'
    ) {
      throw new Error('Native MCP inventory mismatch.');
    }

    // Validation only: canonical admission remains in the authenticated MCP call.
    prepareMcpQuestion(args.Arguments);

    return { step, decision: { decision: 'allow' }, revalidate: () => Promise.resolve() };
  }

  let target: unknown;
  let directory = false;
  let writable = false;
  let interaction: Permission | undefined;
  const fileTools: Record<string, { path: string; writable: boolean }> = {
    view_file: { path: 'AbsolutePath', writable: false },
    list_dir: { path: 'DirectoryPath', writable: false },
    find_by_name: { path: 'SearchDirectory', writable: false },
    grep_search: { path: 'SearchPath', writable: false },
    write_to_file: { path: 'TargetFile', writable: true },
    replace_file_content: { path: 'TargetFile', writable: true },
    multi_replace_file_content: { path: 'TargetFile', writable: true },
  };
  const name = typeof tool.name === 'string' ? tool.name : '';
  const file = Object.hasOwn(fileTools, name) ? fileTools[name] : undefined;
  if (file && (!file.writable || context.writable)) {
    validateAntigravityFileArguments(name, args);
    target = args[file.path];
    writable = file.writable;
    if (file.writable && typeof target === 'string') {
      if (executionConfiguration(context.workspace, resolve(target))) {
        throw new Error('Native tool cannot change active execution configuration.');
      }
    }
  } else if (
    tool.name === 'run_command' &&
    context.writable &&
    context.commandsAllowed === true &&
    fields.every((key) =>
      [
        'CommandLine',
        'Cwd',
        'WaitMsBeforeAsync',
        'toolSummary',
        'toolAction',
        'BypassSandbox',
        'IsDaemon',
      ].includes(key),
    )
  ) {
    if (
      typeof args.CommandLine !== 'string' ||
      !args.CommandLine.trim() ||
      Buffer.byteLength(args.CommandLine) > 7000 ||
      (args.BypassSandbox !== undefined && args.BypassSandbox !== false) ||
      (args.IsDaemon !== undefined && args.IsDaemon !== false) ||
      typeof args.toolSummary !== 'string' ||
      typeof args.toolAction !== 'string' ||
      typeof args.WaitMsBeforeAsync !== 'number' ||
      !Number.isSafeInteger(args.WaitMsBeforeAsync) ||
      args.WaitMsBeforeAsync < 1
    ) {
      throw new Error('Unsupported native background command.');
    }

    target = args.Cwd;
    directory = true;
    interaction = {
      kind: 'permission',
      prompt: 'Allow this native command once?',
      actionSummary: JSON.stringify({
        operation: 'command',
        command: args.CommandLine,
        cwd:
          typeof args.Cwd === 'string' ? relative(context.workspace, args.Cwd) || '.' : undefined,
        authority: 'workspace-write',
        approval: 'once',
      }),
    };
    validateDriverFact({ kind: 'interaction', key: 'validation', interaction });
  } else {
    throw new Error('Native tool is unavailable through this execution adapter.');
  }

  const revalidate = () => physicalInRoot(context.workspace, target, directory, writable);
  await revalidate();

  return {
    step,
    decision: { decision: 'allow' },
    ...(interaction ? { interaction } : {}),
    revalidate,
  };
}
