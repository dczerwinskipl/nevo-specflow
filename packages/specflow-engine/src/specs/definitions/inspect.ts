import { realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { DefinitionProblem } from '@nevo/specflow-contracts/documents';

import type { SpecFlowEngine } from '../../application';
import { createDefaultDefinitionRegistry } from './kinds';
import { loadDefinitions, type LoadResult } from './loader';
import { capProblems } from './project-catalogue';
import {
  DEFINITIONS_RELATIVE_PATH,
  createFilesystemDefinitionSource,
  type DefinitionSource,
} from './source';

/**
 * Read-only views of a definitions tree for the `definitions` commands: what is defined, one
 * definition with its problems, and a validation of the project or of any definitions folder. They run
 * the same loader as the Runtime catalogue, so the problems agree by construction. Nothing is written,
 * no lock is taken and no process is started.
 */

export interface DefinitionsReport {
  /** False when there is no definitions folder. */
  readonly rootPresent: boolean;
  /** At most the contract size: errors first, then by source. */
  readonly problems: readonly DefinitionProblem[];
  readonly problemsTruncated: boolean;
  /** True when at least one problem is an error (a warning alone does not make a tree invalid). */
  readonly hasErrors: boolean;
}

export interface ListedDefinition {
  readonly kind: string;
  readonly id: string;
  /** Path relative to the definitions folder. */
  readonly source: string;
  readonly title?: string;
  readonly version?: number;
}

export interface DefinitionsListing extends DefinitionsReport {
  readonly definitions: readonly ListedDefinition[];
  /** `<kind>/<id>` of files that exist but were rejected. */
  readonly invalid: readonly string[];
}

export type ShownDefinition =
  | {
      readonly state: 'valid';
      readonly kind: string;
      readonly id: string;
      readonly source: string;
      readonly entity: unknown;
    }
  | {
      readonly state: 'invalid';
      readonly kind: string;
      readonly id: string;
      readonly source: string;
      readonly problems: readonly DefinitionProblem[];
    }
  | { readonly state: 'absent'; readonly kind: string; readonly id: string };

const registry = createDefaultDefinitionRegistry();

function reportOf(result: LoadResult): DefinitionsReport {
  const capped = capProblems(result.problems);

  return {
    rootPresent: result.rootPresent,
    problems: capped.problems,
    problemsTruncated: capped.problemsTruncated,
    hasErrors: result.problems.some((problem) => problem.severity === 'error'),
  };
}

function projectSource(engine: SpecFlowEngine): DefinitionSource {
  return createFilesystemDefinitionSource(
    join(engine.context.project.homeRoot, ...DEFINITIONS_RELATIVE_PATH.split('/')),
  );
}

function stringField(entity: unknown, name: string): string | undefined {
  const value = (entity as Record<string, unknown> | null)?.[name];

  return typeof value === 'string' ? value : undefined;
}

/** Every definition of the project (optionally of one kind) and the problems of the rest. */
export async function listProjectDefinitions(
  engine: SpecFlowEngine,
  options: { readonly kind?: string } = {},
): Promise<DefinitionsListing> {
  if (options.kind !== undefined && !registry.has(options.kind)) {
    throw new Error(`"${options.kind}" is not a definition kind.`);
  }

  const result = await loadDefinitions(projectSource(engine), registry);
  const definitions: ListedDefinition[] = [];
  const invalid: string[] = [];
  for (const kind of registry.loadOrder()) {
    if (options.kind !== undefined && kind.kind !== options.kind) {
      continue;
    }

    for (const loaded of result.definitions.get(kind.kind)?.values() ?? []) {
      const title = stringField(loaded.entity, 'title');
      const version = (loaded.entity as { version?: unknown }).version;
      definitions.push({
        kind: kind.kind,
        id: loaded.id,
        source: loaded.source,
        ...(title !== undefined ? { title } : {}),
        ...(typeof version === 'number' ? { version } : {}),
      });
    }

    for (const id of [...(result.invalid.get(kind.kind) ?? [])].sort()) {
      invalid.push(`${kind.kind}/${id}`);
    }
  }

  return { ...reportOf(result), definitions, invalid };
}

/** One definition by `<kind>/<id>`: the resolved entity, or why the file is rejected, or absent. */
export async function showProjectDefinition(
  engine: SpecFlowEngine,
  target: string,
): Promise<ShownDefinition> {
  const match = /^([a-z][a-z0-9-]{0,31})\/([a-z][a-z0-9-]{0,31})$/u.exec(target);
  if (!match || !registry.has(match[1] ?? '')) {
    throw new Error(`"${target}" is not of the form <kind>/<id> with a known kind.`);
  }

  const kind = match[1] ?? '';
  const id = match[2] ?? '';
  const result = await loadDefinitions(projectSource(engine), registry);
  const loaded = result.definitions.get(kind)?.get(id);
  if (loaded) {
    return { state: 'valid', kind, id, source: loaded.source, entity: loaded.entity };
  }

  const source = `${kind}/${id}.yaml`;
  if (result.invalid.get(kind)?.has(id)) {
    const own = result.problems.filter(
      (problem) => problem.source === source || problem.source.startsWith(`${kind}/${id}.`),
    );

    return { state: 'invalid', kind, id, source, problems: own };
  }

  return { state: 'absent', kind, id };
}

/** The problems of the project's definitions (what the Runtime catalogue route reports). */
export async function validateProjectDefinitions(
  engine: SpecFlowEngine,
): Promise<DefinitionsReport> {
  return reportOf(await loadDefinitions(projectSource(engine), registry));
}

/**
 * The problems of any definitions folder (one that holds `document-type/`, `specification-archetype/`
 * and so on), for example a folder prepared for another project. The folder must be a real directory.
 */
export async function validateDefinitionsFolder(folder: string): Promise<DefinitionsReport> {
  const info = await stat(folder);
  if (!info.isDirectory()) {
    throw new Error('The path is not a folder of definitions.');
  }

  const root = await realpath(folder);

  return reportOf(await loadDefinitions(createFilesystemDefinitionSource(root), registry));
}
