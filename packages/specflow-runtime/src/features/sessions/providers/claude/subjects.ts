/**
 * What a Claude tool call acts on, as the Work history names it (`ToolActionSummary.subject`):
 * short, language-neutral, and never an absolute path of the person's machine. The client puts its
 * own verb before it ("Ran command", "Edited file").
 */
const SUBJECT_MAX = 160;
const MESSAGE_MAX = 300;

/** The first non-empty line, cut to `max` characters; `…` marks anything left out. */
export function firstLine(value: string, max = SUBJECT_MAX): string | undefined {
  const lines = value.split(/\r?\n/).map((line) => line.trim());
  const index = lines.findIndex(Boolean);
  if (index < 0) {
    return undefined;
  }

  const line = lines[index]!;
  const more = lines.slice(index + 1).some(Boolean);
  if (line.length > max) {
    return line.slice(0, max - 1).trimEnd() + '…';
  }

  return more ? line + ' …' : line;
}

const separators = (value: string) => value.replace(/\\/g, '/');

/**
 * A path inside `workspace` relative to it; any other absolute path by its last two segments
 * (`…/dir/file`), so no home directory or user name is shown.
 */
export function workspacePath(path: string, workspace?: string): string {
  const normalized = separators(path.trim());
  if (workspace) {
    const root = separators(workspace).replace(/\/+$/, '');
    const windows = /^[A-Za-z]:\//.test(root);
    const inside = windows
      ? normalized.toLowerCase().startsWith(root.toLowerCase() + '/')
      : normalized.startsWith(root + '/');
    if (inside) {
      return normalized.slice(root.length + 1);
    }

    if (windows ? normalized.toLowerCase() === root.toLowerCase() : normalized === root) {
      return '.';
    }
  }

  if (!/^(?:[A-Za-z]:)?\//.test(normalized)) {
    return normalized;
  }

  const segments = normalized.split('/').filter(Boolean);

  return segments.length <= 2 ? normalized : '…/' + segments.slice(-2).join('/');
}

/** Every absolute path inside `workspace` in free text, made relative to it. */
export function relativeText(value: string, workspace?: string): string {
  if (!workspace) {
    return value;
  }

  const root = workspace.replace(/[\\/]+$/, '');
  const escaped = root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\\|\//g, '[\\\\/]');
  const pattern = new RegExp(escaped + '[\\\\/]?', /^[A-Za-z]:/.test(root) ? 'gi' : 'g');

  // A path under the root loses it; the root itself reads as `.`.
  return value.replace(pattern, (match) => (/[\\/]$/.test(match) ? '' : '.'));
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined);

/** The subject of one Claude tool call from its input; absent when the tool names nothing. */
export function claudeToolSubject(
  name: string,
  input: Record<string, unknown>,
  workspace?: string,
): string | undefined {
  const path = text(input.file_path) ?? text(input.notebook_path);
  switch (name) {
    case 'Bash': {
      const command = text(input.command);

      return command ? firstLine(relativeText(command, workspace)) : undefined;
    }

    case 'Read':
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return path ? firstLine(workspacePath(path, workspace)) : undefined;
    case 'Glob':
    case 'Grep': {
      const pattern = text(input.pattern);
      const scope = text(input.path);

      return pattern
        ? firstLine(pattern + (scope ? ' · ' + workspacePath(scope, workspace) : ''))
        : undefined;
    }

    case 'WebFetch':
      return text(input.url) && firstLine(input.url as string);
    case 'WebSearch':
      return text(input.query) && firstLine(input.query as string);
    case 'Task':
      return text(input.description) && firstLine(input.description as string);
    default:
      return path ? firstLine(workspacePath(path, workspace)) : undefined;
  }
}

/**
 * A stable reason for a failed tool call the client words itself: `outside-worktree` when
 * Claude's restricted file tools refused a path outside the Turn's working directory.
 */
export function claudeToolFailureReason(output: string): string | undefined {
  return /is outside .*confines the file tools to the working directory/s.test(output)
    ? 'outside-worktree'
    : undefined;
}

/**
 * The short reason of a failed tool call from its result: Claude's `<tool_use_error>` wrapper
 * removed, workspace paths made relative, the first line only.
 */
export function claudeToolError(output: string, workspace?: string): string {
  const unwrapped = output.replace(/<\/?tool_use_error>/g, '');

  return firstLine(relativeText(unwrapped, workspace), MESSAGE_MAX) ?? 'The tool call failed.';
}
