import type { CreateTaskInput } from '@nevo/specflow-engine';
import { InvalidArgumentError } from 'commander';

import { readStructuredFile } from '../structured-input';

export type TaskContextEntry = NonNullable<CreateTaskInput['context']>[number];

const SHORTHAND_KINDS = {
  'task-doc': 'task-document',
  'spec-doc': 'specification-document',
  'project-doc': 'project-document',
  path: 'path',
  instructions: 'instructions',
} as const;

/** `artifact:<kind>:<value>` marks a process artifact: awaited while missing, not refused. */
const ARTIFACT_PREFIX = 'artifact:';

/**
 * One `--context <kind>:<value>` entry; it is always required. The kinds are `task-doc`, `spec-doc`,
 * `project-doc` (a document id), `path` and `instructions` (the text). The prefix `artifact:` marks a
 * reference as a process artifact (`artifact: true`; not for `instructions`). An optional entry or
 * one with a note comes from `--context-file`. The Engine validates the entry and that it resolves.
 */
export function parseContextShorthand(text: string): TaskContextEntry {
  const artifact = text.startsWith(ARTIFACT_PREFIX);
  const body = artifact ? text.slice(ARTIFACT_PREFIX.length) : text;
  const separator = body.indexOf(':');
  const kind = separator < 0 ? '' : body.slice(0, separator);
  const value = separator < 0 ? '' : body.slice(separator + 1);
  if (!Object.hasOwn(SHORTHAND_KINDS, kind) || value.trim() === '') {
    throw new InvalidArgumentError(
      `"${text}" is not [artifact:]<kind>:<value> with a kind of ${Object.keys(SHORTHAND_KINDS).join(', ')}.`,
    );
  }

  const mapped = SHORTHAND_KINDS[kind as keyof typeof SHORTHAND_KINDS];
  if (mapped === 'instructions') {
    if (artifact) {
      throw new InvalidArgumentError(`"${text}": instructions cannot be an artifact.`);
    }

    return { kind: mapped, text: value, required: true };
  }

  const marker = artifact ? { artifact: true } : {};

  return mapped === 'path'
    ? { kind: mapped, path: value, required: true, ...marker }
    : { kind: mapped, id: value, required: true, ...marker };
}

export function collectContext(value: string, previous: TaskContextEntry[]): TaskContextEntry[] {
  return [...previous, parseContextShorthand(value)];
}

/** A YAML or JSON list of entries, in the shape of the `context` of `task.yaml`. */
export async function readContextFile(cwd: string, path: string): Promise<TaskContextEntry[]> {
  const parsed = await readStructuredFile(cwd, path, 'context');
  if (!Array.isArray(parsed)) {
    throw new InvalidArgumentError(`The context file ${path} must hold a list of entries.`);
  }

  return parsed as TaskContextEntry[];
}

export interface ContextOptions {
  readonly context?: readonly TaskContextEntry[];
  readonly contextFile?: string;
}

/** The entries of `--context-file`, then those of `--context`; undefined when neither is given. */
export async function contextOf(
  cwd: string,
  options: ContextOptions,
): Promise<TaskContextEntry[] | undefined> {
  const given = options.context ?? [];
  if (options.contextFile === undefined && given.length === 0) {
    return undefined;
  }

  const fromFile =
    options.contextFile !== undefined ? await readContextFile(cwd, options.contextFile) : [];

  return [...fromFile, ...given];
}
