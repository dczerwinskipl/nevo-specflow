import { DiscoveryLimits as Limits, type DiscoveryRequest, type DiscoveryTool } from './contract';
import type { DiscoveryHandle } from './windows-reader';

export interface DiscoveryResult {
  status: 'complete' | 'partial' | 'truncated' | 'cancelled' | 'failed';
  entries: { path: string; type: 'file' | 'directory' }[];
  matches: { path: string; line: number; column: number; text: string }[];
  counts: {
    visited: number;
    files: number;
    bytes: number;
    excluded: number;
    binary: number;
    errors: number;
  };
  reasons: string[];
  issues: { path: string; reason: string }[];
}

// Dynamic programming, never a caller-supplied regular expression. ** is an
// entire path component; * and ? match within one component. Bare globs match names.
export function matchesDiscoveryGlob(pattern: string, path: string): boolean {
  function nameMatches(glob: string, name: string) {
    let row = Array<boolean>(name.length + 1).fill(false);
    row[0] = true;
    for (const char of glob) {
      const next = Array<boolean>(name.length + 1).fill(false);
      next[0] = char === '*' && row[0]!;
      for (let j = 1; j <= name.length; j++) {
        next[j] =
          char === '*'
            ? next[j - 1]! || row[j]!
            : row[j - 1]! && (char === '?' || char === name[j - 1]);
      }

      row = next;
    }

    return row[name.length]!;
  }

  if (!pattern.includes('/')) {
    return nameMatches(pattern, path.split('/').at(-1)!);
  }

  const globs = pattern.split('/');
  const names = path.split('/');
  let row = Array<boolean>(names.length + 1).fill(false);
  row[0] = true;
  for (const glob of globs) {
    const next = Array<boolean>(names.length + 1).fill(false);
    next[0] = glob === '**' && row[0]!;
    for (let j = 1; j <= names.length; j++) {
      next[j] =
        glob === '**' ? next[j - 1]! || row[j]! : row[j - 1]! && nameMatches(glob, names[j - 1]!);
    }

    row = next;
  }

  return row[names.length]!;
}

export function discoveryPrivatePath(path: string) {
  const parts = path.toLowerCase().split('/');

  return parts.some(
    (part, i) =>
      part === '.git' ||
      (part === '.nevo' && parts[i + 1] === 'local') ||
      (part === '.agents' &&
        ['hooks.json', 'mcp_config.json', 'plugins', 'sidecars', 'projects'].includes(
          parts[i + 1] ?? '',
        )),
  );
}

export function emptyDiscoveryResult(
  status: DiscoveryResult['status'],
  reason?: string,
): DiscoveryResult {
  return {
    status,
    entries: [],
    matches: [],
    counts: { visited: 0, files: 0, bytes: 0, excluded: 0, binary: 0, errors: 0 },
    reasons: reason ? [reason] : [],
    issues: [],
  };
}

/** The reader alone owns physical authority. Names are output/filter data, never
 * reopened filesystem paths. Parents remain held until every child is closed. */
export function scanDiscovery(
  root: DiscoveryHandle,
  tool: DiscoveryTool,
  request: DiscoveryRequest,
): DiscoveryResult {
  const result = emptyDiscoveryResult('complete');
  const reasons = new Set<string>();
  let stop = false;
  const issue = (path: string, reason: string) => {
    result.counts.errors++;
    if (result.issues.length < 16) {
      result.issues.push({ path, reason });
      if (Buffer.byteLength(JSON.stringify(result)) > Limits.outputBytes - 1024) {
        result.issues.pop();
        reasons.add('issue-output-limit');
      }
    }
  };

  const truncate = (reason: string, finish = false) => {
    reasons.add(reason);
    stop ||= finish;
  };

  const visited = () => {
    if (result.counts.visited >= Limits.entries) {
      truncate('entry-limit', true);

      return false;
    }

    result.counts.visited++;

    return true;
  };

  const append = (
    item: DiscoveryResult['entries'][number] | DiscoveryResult['matches'][number],
    match: boolean,
  ) => {
    if (match) {
      result.matches.push(item as DiscoveryResult['matches'][number]);
    } else {
      result.entries.push(item as DiscoveryResult['entries'][number]);
    }

    if (
      result.entries.length + result.matches.length > Limits.results ||
      Buffer.byteLength(JSON.stringify(result)) > Limits.outputBytes - 2048
    ) {
      if (match) {
        result.matches.pop();
      } else {
        result.entries.pop();
      }

      truncate('output-limit', true);
    }
  };

  const excluded = (path: string) =>
    discoveryPrivatePath(path) ||
    request.excludes.some((pattern) => matchesDiscoveryGlob(pattern, path));
  const included = (path: string) =>
    !request.includes.length ||
    request.includes.some((pattern) => matchesDiscoveryGlob(pattern, path));
  const fold = (text: string) =>
    request.caseInsensitive ? text.replace(/[A-Z]/g, (char) => char.toLowerCase()) : text;
  const needle = fold(request.query ?? '');
  function file(handle: DiscoveryHandle, path: string) {
    if (result.counts.files >= Limits.files) {
      truncate('file-limit', true);

      return;
    }

    result.counts.files++;
    if (handle.size > BigInt(Limits.fileBytes)) {
      truncate('large-file');

      return;
    }

    const size = Number(handle.size);
    if (result.counts.bytes + size > Limits.readBytes) {
      truncate('read-byte-limit', true);

      return;
    }

    const bytes = handle.read(size);
    result.counts.bytes += bytes.length;
    if (bytes.length !== size) {
      issue(path, 'file-changed-or-short-read');

      return;
    }

    let text: string;
    try {
      if (bytes.includes(0)) {
        throw new Error('Binary file.');
      }

      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      result.counts.binary++;

      return;
    }

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length && !stop; i++) {
      const line = lines[i]!;
      const index = fold(line).indexOf(needle);
      if (index >= 0) {
        append(
          {
            path,
            line: i + 1,
            column: index + 1,
            text: line.slice(Math.max(0, index - 80), index + 176),
          },
          true,
        );
        if (!request.matchPerLine) {
          break;
        }
      }
    }
  }

  function walk(handle: DiscoveryHandle, path: string, depth: number) {
    for (const entry of handle.entries()) {
      if (stop || !visited()) {
        break;
      }

      const childPath = path ? path + '/' + entry.name : entry.name;
      if (excluded(childPath)) {
        result.counts.excluded++;
        continue;
      }

      if (childPath.length > 1024) {
        truncate('path-length');
        continue;
      }

      if (entry.reparse) {
        issue(childPath, 'link-or-reparse-point');
        continue;
      }

      let child: DiscoveryHandle | undefined;
      try {
        child = handle.child(entry);
        if (tool === 'list_directory' && included(childPath)) {
          append({ path: childPath, type: child.directory ? 'directory' : 'file' }, false);
        }

        if (
          tool === 'find_files' &&
          included(childPath) &&
          (request.type === 'any' || (request.type === 'directory') === child.directory) &&
          matchesDiscoveryGlob(request.pattern!, childPath)
        ) {
          append({ path: childPath, type: child.directory ? 'directory' : 'file' }, false);
        }

        if (stop) {
          return;
        }

        if (child.directory) {
          if (depth < request.maxDepth && tool !== 'list_directory') {
            walk(child, childPath, depth + 1);
          } else if (tool !== 'list_directory') {
            truncate('depth-limit');
          }
        } else if (tool === 'search_text' && included(childPath)) {
          file(child, childPath);
        }
      } catch {
        issue(childPath, 'entry-unavailable-or-identity-changed');
      } finally {
        child?.close();
      }
    }
  }

  const held: DiscoveryHandle[] = [];
  try {
    if (discoveryPrivatePath(request.path)) {
      throw new Error('Private discovery path.');
    }

    let selected = root;
    if (request.path !== '.') {
      let selectedPath = '';
      for (const part of request.path.split('/')) {
        selectedPath = selectedPath ? selectedPath + '/' + part : part;
        if (excluded(selectedPath)) {
          result.counts.excluded++;

          return result;
        }

        let found = false;
        for (const entry of selected.entries()) {
          if (!visited()) {
            break;
          }

          if (entry.name === part) {
            selected = selected.child(entry);
            held.push(selected);
            found = true;
            break;
          }
        }

        if (!found) {
          throw new Error('Discovery path missing or inaccessible.');
        }
      }
    }

    if (selected.directory) {
      walk(selected, request.path === '.' ? '' : request.path, 0);
    } else if (tool === 'search_text') {
      if (included(request.path)) {
        file(selected, request.path);
      }
    } else {
      throw new Error('Discovery requires a directory.');
    }

    result.status = reasons.size ? 'truncated' : result.counts.errors ? 'partial' : 'complete';
  } catch {
    result.status = 'failed';
    reasons.add('path-or-traversal-failed');
  } finally {
    for (const handle of held.reverse()) {
      handle.close();
    }
  }

  result.reasons = [...reasons];

  return result;
}
