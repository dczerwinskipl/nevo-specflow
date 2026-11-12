import {
  TASK_MAIN_DOCUMENT,
  TASK_RESOURCE_SCHEMA_VERSION,
  TaskIndexFileSchema,
  TaskManifestFileSchema,
  type TaskContextEntry,
} from '@nevo/specflow-contracts/documents';
import { Value } from 'typebox/value';
import { parse, stringify } from 'yaml';

import { foldPathKey, validateDocumentPath } from '../../specs/document-rules/document-paths';
import { WorkflowError } from '../../workflow/errors';
import { RECORD_BYTES_MAX } from '../../workflow/limits';
import { TASK_MANIFEST_FILE, type TaskIndex, type TaskManifest } from './model';

/**
 * Strict text format of `tasks/index.yaml` and `tasks/<id>/task.yaml`. Every read checks the shape of
 * the whole file against the published schema (`@nevo/specflow-contracts/documents`) and the rules
 * the schema cannot express ({@link taskManifestProblems}); a file that fails is
 * `WORKFLOW_STATE_CORRUPT`, never interpreted. Every write checks the text it produces the same way,
 * so a file that would not read back is never stored. No older format is read (strict cutover).
 *
 * Rules across files (index entry ↔ folder ↔ manifest, dependencies, existence of context references)
 * are `./validate.ts`.
 */

function corrupt(what: string, detail?: string): never {
  throw new WorkflowError(
    'WORKFLOW_STATE_CORRUPT',
    `The stored ${what} is not valid${detail === undefined ? '' : `: ${detail}`}.`,
  );
}

function parseYaml(source: string, what: string): unknown {
  if (Buffer.byteLength(source, 'utf8') > RECORD_BYTES_MAX) {
    corrupt(what, 'it is larger than allowed');
  }

  try {
    return parse(source, { maxAliasCount: 0 }) as unknown;
  } catch {
    return corrupt(what);
  }
}

const yamlOf = (value: unknown) => stringify(value, { lineWidth: 0 });

/** The text to store, checked as a later read checks it. Over the byte budget is a refusal. */
function checkedText(text: string, read: (source: string) => unknown, what: string): string {
  if (Buffer.byteLength(text, 'utf8') > RECORD_BYTES_MAX) {
    throw new WorkflowError(
      'WORKFLOW_INPUT_INVALID',
      `The ${what} would exceed its stored size limit of ${String(RECORD_BYTES_MAX)} bytes.`,
    );
  }

  try {
    read(text);
  } catch (error) {
    if (error instanceof WorkflowError) {
      throw new WorkflowError('WORKFLOW_STATE_CORRUPT', `The ${what} to store is not valid.`);
    }

    throw error;
  }

  return text;
}

export function parseTaskIndex(source: string): TaskIndex {
  const value = parseYaml(source, 'Task index');
  if (!Value.Check(TaskIndexFileSchema, value)) {
    corrupt('Task index');
  }

  const ids = value.tasks.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) {
    corrupt('Task index', 'it lists a Task twice');
  }

  return { tasks: value.tasks.map((entry) => ({ id: entry.id })) };
}

export function serializeTaskIndex(index: TaskIndex): string {
  return checkedText(
    yamlOf({
      schemaVersion: TASK_RESOURCE_SCHEMA_VERSION,
      tasks: index.tasks.map((entry) => ({ id: entry.id })),
    }),
    parseTaskIndex,
    'Task index',
  );
}

/**
 * A repository-relative file, folder or glob of a `path` context entry: POSIX `/`, not absolute, no
 * drive letter, no empty, `.` or `..` segment, no backslash and no control character. Glob characters
 * are allowed; whether the path matches anything is checked when the Task is created or edited.
 */
export function contextPathProblem(path: string): string | undefined {
  if (path.startsWith('/') || /^[A-Za-z]:/u.test(path)) {
    return 'is not relative to the repository root';
  }

  if (path.includes('\\') || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(path) || !path.isWellFormed()) {
    return 'contains a character a path may not have';
  }

  if (path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return 'has an empty, "." or ".." segment';
  }

  return undefined;
}

function contextKey(entry: TaskContextEntry): string {
  switch (entry.kind) {
    case 'path':
      return `path:${entry.path}`;
    case 'instructions':
      return `instructions:${entry.text}`;
    default:
      return `${entry.kind}:${entry.id}`;
  }
}

/**
 * Every rule of one manifest the schema does not express, as messages (empty when it is valid):
 * the `task` document is registered as `task.md` of type `task`; document ids and paths are unique
 * and every path is a portable document path below the Task folder other than `task.yaml`; the Task
 * does not depend on itself; context paths are repository-relative and no context entry is listed
 * twice. Used by the parser and, for input, by the Task operations.
 */
export function taskManifestProblems(manifest: TaskManifest): string[] {
  const problems: string[] = [];
  const main = manifest.documents.find((document) => document.id === TASK_MAIN_DOCUMENT.id);
  if (main?.path !== TASK_MAIN_DOCUMENT.path || main.type !== TASK_MAIN_DOCUMENT.type) {
    problems.push('the "task" document must be registered as "task.md" of type "task"');
  }

  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const document of manifest.documents) {
    const key = foldPathKey(document.path);
    if (ids.has(document.id) || paths.has(key)) {
      problems.push(`the document "${document.id}" is registered twice`);
    }

    ids.add(document.id);
    paths.add(key);
    if (!validateDocumentPath(document.path).ok || key === TASK_MANIFEST_FILE) {
      problems.push(`the document "${document.id}" has an invalid path`);
    }
  }

  if (manifest.dependsOn.includes(manifest.id)) {
    problems.push('the Task depends on itself');
  }

  const entries = new Set<string>();
  for (const [position, entry] of (manifest.context ?? []).entries()) {
    const key = contextKey(entry);
    if (entries.has(key)) {
      problems.push(`the context entry ${String(position + 1)} is listed twice`);
    }

    entries.add(key);
    const pathProblem = entry.kind === 'path' ? contextPathProblem(entry.path) : undefined;
    if (pathProblem !== undefined) {
      problems.push(`the context path ${String(position + 1)} ${pathProblem}`);
    }
  }

  return problems;
}

/** Parse `task.yaml`. `taskId` is its folder name, which the manifest's `id` must equal. */
export function parseTaskManifest(source: string, taskId: string): TaskManifest {
  const value = parseYaml(source, `Task manifest of "${taskId}"`);
  if (!Value.Check(TaskManifestFileSchema, value)) {
    corrupt(`Task manifest of "${taskId}"`);
  }

  const { $schema: _schema, schemaVersion: _version, ...manifest } = value;
  if (manifest.id !== taskId) {
    corrupt(`Task manifest of "${taskId}"`, 'it holds another Task');
  }

  const [problem] = taskManifestProblems(manifest);
  if (problem !== undefined) {
    corrupt(`Task manifest of "${taskId}"`, problem);
  }

  return manifest;
}

export function serializeTaskManifest(manifest: TaskManifest): string {
  return checkedText(
    yamlOf({
      schemaVersion: TASK_RESOURCE_SCHEMA_VERSION,
      id: manifest.id,
      title: manifest.title,
      ...(manifest.summary !== undefined ? { summary: manifest.summary } : {}),
      type: manifest.type,
      status: manifest.status,
      ...(manifest.statusChange !== undefined ? { statusChange: manifest.statusChange } : {}),
      dependsOn: manifest.dependsOn,
      origin: manifest.origin,
      documents: manifest.documents,
      ...(manifest.context !== undefined ? { context: manifest.context } : {}),
    }),
    (text) => parseTaskManifest(text, manifest.id),
    `Task manifest of "${manifest.id}"`,
  );
}

/**
 * The first text of `task.md` for a new Task: its title and summary. Later edits go through the
 * Task's documents.
 */
export function initialTaskDocument(manifest: Pick<TaskManifest, 'title' | 'summary'>): string {
  return `# ${manifest.title}\n${manifest.summary === undefined ? '' : `\n${manifest.summary}\n`}`;
}
