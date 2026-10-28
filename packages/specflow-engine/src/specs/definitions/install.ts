import type { DefinitionKindRegistry } from './kind-registry';
import {
  DEFINITION_DIRECTORY_OVERFLOW,
  DEFINITION_FILE_MAX_BYTES,
  DEFINITION_TEMPLATE_FILE_MAX_BYTES,
} from './limits';
import { loadDefinitions, type LoadedDefinition } from './loader';
import type { DefinitionSource } from './source';
import type { DefinitionWriter } from './writer';

/**
 * Installing the shipped definitions into a project (architecture "Definitions as project data",
 * "Install"). Rules, each in this one place:
 *
 * - bare `install` is bootstrap only: it works when the project has no definition file yet, otherwise
 *   it refuses and names the ways to add (`<kind>/<id>`, `--add-missing`), so a definition the owner
 *   deleted is never resurrected silently;
 * - an existing file that differs is never overwritten without `force`;
 * - installing a definition installs the definitions it refers to (an archetype installs its document
 *   types) and the template files it is built from;
 * - a target that is a link or a special file, or a kind folder that cannot be read safely, refuses
 *   the whole install before anything is written;
 * - files are written atomically (a file the plan saw as absent is created exclusively, so one that
 *   appeared meanwhile is never replaced); there is no version stamp, hash or upgrade path (there are
 *   no existing projects). Whether the written files are committed is decided by the caller.
 */

export interface InstallOptions {
  /** `<kind>/<id>` of the definitions to install; empty or absent selects the bare or `addMissing` mode. */
  readonly targets?: readonly string[];
  /** Install every shipped definition that the project does not have. */
  readonly addMissing?: boolean;
  /** Overwrite a differing existing file. */
  readonly force?: boolean;
  /** Compute the plan and write nothing. */
  readonly dryRun?: boolean;
}

export type InstallMode = 'bootstrap' | 'add-missing' | 'explicit';

export type InstallAction =
  /** The file is not there and will be written. */
  | 'create'
  /** The file differs and `force` replaces it. */
  | 'overwrite'
  /** The file is there with the shipped content. */
  | 'unchanged'
  /** The file is there and differs; it is kept (use `force`). */
  | 'skipped-edited'
  /** The path is a symlink or not a regular file: never written. */
  | 'blocked';

export interface InstallItem {
  /** Path relative to `.nevo/definitions`. */
  readonly path: string;
  readonly kind: string;
  readonly role: 'definition' | 'template';
  /** `<kind>/<id>` of the definition this item belongs to. */
  readonly definition: string;
  /** True for a definition the caller named or selected; false when it was added as a dependency. */
  readonly requested: boolean;
  readonly action: InstallAction;
}

export interface InstallPlan {
  readonly mode: InstallMode;
  /** In write order: template files and dependencies before the definitions that use them. */
  readonly items: readonly InstallItem[];
}

export type InstallErrorCode =
  'SEEDS_INVALID' | 'TARGET_INVALID' | 'SEED_NOT_FOUND' | 'INSTALL_WRITE_FAILED';

export class DefinitionInstallError extends Error {
  readonly code: InstallErrorCode;
  /** Paths written before a write failure. */
  readonly written: readonly string[];

  constructor(code: InstallErrorCode, message: string, written: readonly string[] = []) {
    super(message);
    this.name = 'DefinitionInstallError';
    this.code = code;
    this.written = written;
  }
}

export type InstallRefusal =
  | {
      readonly status: 'refused';
      readonly reason: 'definitions-exist';
      /** What the owner can run instead. */
      readonly hint: string;
      /** `<kind>/<id>` of every shipped definition the project does not have. */
      readonly missing: readonly string[];
      /** `<kind>/<id>` of every shipped definition. */
      readonly available: readonly string[];
    }
  | {
      readonly status: 'refused';
      /** A planned path is a link or a special file, or a folder cannot be read safely. */
      readonly reason: 'target-unsafe';
      readonly hint: string;
      /** The paths (relative to the definitions folder) that block the install. */
      readonly paths: readonly string[];
    };

export type InstallPlanOutcome =
  { readonly status: 'planned'; readonly plan: InstallPlan } | InstallRefusal;

export interface InstallResult {
  readonly outcome: InstallPlanOutcome;
  /** Paths written (empty for a dry run, a refusal or when everything is up to date). */
  readonly written: readonly string[];
}

export interface InstallInput {
  /** The shipped definitions (same layout as a project's definitions folder). */
  readonly seed: DefinitionSource;
  /** The project's definitions folder, read-only view. */
  readonly target: DefinitionSource;
  readonly writer: DefinitionWriter;
  readonly registry: DefinitionKindRegistry;
  readonly options?: InstallOptions;
}

const TARGET_PATTERN = /^([a-z][a-z0-9-]{0,31})\/([a-z][a-z0-9-]{0,31})$/u;

interface SeedDefinition {
  readonly key: string;
  readonly loaded: LoadedDefinition;
  readonly references: readonly string[];
}

async function loadSeeds(input: InstallInput): Promise<Map<string, SeedDefinition>> {
  const result = await loadDefinitions(input.seed, input.registry);
  const failure = result.problems.find((problem) => problem.severity === 'error');
  if (failure) {
    throw new DefinitionInstallError(
      'SEEDS_INVALID',
      `The shipped definitions are invalid (${failure.source}: ${failure.message}).`,
    );
  }
  const seeds = new Map<string, SeedDefinition>();
  for (const kind of input.registry.loadOrder()) {
    for (const loaded of result.definitions.get(kind.kind)?.values() ?? []) {
      seeds.set(`${kind.kind}/${loaded.id}`, {
        key: `${kind.kind}/${loaded.id}`,
        loaded,
        references: kind.references(loaded.entity).map((ref) => `${ref.kind}/${ref.id}`),
      });
    }
  }
  return seeds;
}

type TargetState =
  | { readonly state: 'empty' }
  /** Any entry below a kind folder, a template file included: the owner has started a definitions tree. */
  | { readonly state: 'present' }
  | { readonly state: 'unsafe'; readonly paths: readonly string[] };

async function inspectTarget(
  target: DefinitionSource,
  registry: DefinitionKindRegistry,
): Promise<TargetState> {
  const root = await target.list('', DEFINITION_DIRECTORY_OVERFLOW);
  if (root.state !== 'ok' && root.state !== 'absent') return { state: 'unsafe', paths: [''] };
  const unsafe: string[] = [];
  let present = false;
  for (const kind of registry.loadOrder()) {
    const listing = await target.list(kind.kind, DEFINITION_DIRECTORY_OVERFLOW);
    if (listing.state === 'absent') continue;
    if (listing.state !== 'ok') unsafe.push(kind.kind);
    else if (listing.entries.length > 0) present = true;
  }
  if (unsafe.length > 0) return { state: 'unsafe', paths: unsafe };
  return present ? { state: 'present' } : { state: 'empty' };
}

function unsafeRefusal(paths: readonly string[]): InstallRefusal {
  return {
    status: 'refused',
    reason: 'target-unsafe',
    hint: 'A path below .nevo/definitions is a link, a special file or a folder that cannot be read safely. Remove or replace it, then run the install again; nothing was written.',
    paths: [...paths],
  };
}

async function bytesOf(source: DefinitionSource, path: string, limit: number): Promise<Buffer> {
  const read = await source.read(path, limit);
  if (read.state !== 'ok') {
    throw new DefinitionInstallError('SEEDS_INVALID', `The shipped file ${path} cannot be read.`);
  }
  return read.bytes;
}

async function actionFor(
  input: InstallInput,
  path: string,
  shipped: Buffer,
  force: boolean,
): Promise<InstallAction> {
  const limit = path.includes('/templates/')
    ? DEFINITION_TEMPLATE_FILE_MAX_BYTES
    : DEFINITION_FILE_MAX_BYTES;
  const existing = await input.target.read(path, Math.max(limit, shipped.length));
  switch (existing.state) {
    case 'absent':
      return 'create';
    case 'ok':
      if (existing.bytes.equals(shipped)) return 'unchanged';
      return force ? 'overwrite' : 'skipped-edited';
    case 'too-large':
      return force ? 'overwrite' : 'skipped-edited';
    default:
      return 'blocked';
  }
}

/** The ways to add shipped definitions to a project that already has some. */
function refusalHint(): string {
  return 'The project already has definitions. Run "definitions install <kind>/<id>" to add one, or "definitions install --add-missing" to add every shipped definition the project does not have. Add --force to overwrite an existing file.';
}

export async function planInstall(input: InstallInput): Promise<InstallPlanOutcome> {
  const options = input.options ?? {};
  const seeds = await loadSeeds(input);
  const targets = options.targets ?? [];

  let mode: InstallMode;
  let roots: string[];
  if (targets.length > 0) {
    mode = 'explicit';
    roots = [];
    for (const target of targets) {
      const match = TARGET_PATTERN.exec(target);
      if (!match) {
        throw new DefinitionInstallError(
          'TARGET_INVALID',
          `"${target}" is not of the form <kind>/<id>.`,
        );
      }
      if (!input.registry.has(match[1] ?? '')) {
        throw new DefinitionInstallError(
          'TARGET_INVALID',
          `"${match[1]}" is not a definition kind.`,
        );
      }
      if (!seeds.has(target)) {
        throw new DefinitionInstallError(
          'SEED_NOT_FOUND',
          `"${target}" is not among the shipped definitions (${[...seeds.keys()].join(', ')}).`,
        );
      }
      roots.push(target);
    }
  } else if (options.addMissing === true) {
    mode = 'add-missing';
    roots = [...seeds.keys()];
  } else {
    mode = 'bootstrap';
    roots = [...seeds.keys()];
    const state = await inspectTarget(input.target, input.registry);
    if (state.state === 'unsafe') return unsafeRefusal(state.paths);
    if (state.state === 'present') {
      const missing: string[] = [];
      for (const [key, seed] of seeds) {
        if ((await input.target.stat(seed.loaded.source)).state === 'absent') missing.push(key);
      }
      return {
        status: 'refused',
        reason: 'definitions-exist',
        hint: refusalHint(),
        missing,
        available: [...seeds.keys()],
      };
    }
  }

  // Dependency closure: a definition brings the definitions it refers to.
  const requested = new Set(roots);
  const selected = new Set(roots);
  const queue = [...roots];
  while (queue.length > 0) {
    const key = queue.shift()!;
    for (const reference of seeds.get(key)?.references ?? []) {
      if (seeds.has(reference) && !selected.has(reference)) {
        selected.add(reference);
        queue.push(reference);
      }
    }
  }

  const order = new Map(input.registry.loadOrder().map((kind, index) => [kind.kind, index]));
  const ordered = [...selected].sort((left, right) => {
    const a = seeds.get(left)!;
    const b = seeds.get(right)!;
    return (
      (order.get(a.loaded.kind) ?? 0) - (order.get(b.loaded.kind) ?? 0) ||
      (left < right ? -1 : left > right ? 1 : 0)
    );
  });

  const items: InstallItem[] = [];
  const seen = new Set<string>();
  for (const key of ordered) {
    const seed = seeds.get(key)!;
    const files = [
      ...seed.loaded.auxiliary
        .map((path) => ({ path: `${seed.loaded.kind}/${path}`, role: 'template' as const }))
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
      { path: seed.loaded.source, role: 'definition' as const },
    ];
    for (const file of files) {
      if (seen.has(file.path)) continue;
      seen.add(file.path);
      const shipped = await bytesOf(
        input.seed,
        file.path,
        file.role === 'template' ? DEFINITION_TEMPLATE_FILE_MAX_BYTES : DEFINITION_FILE_MAX_BYTES,
      );
      items.push({
        path: file.path,
        kind: seed.loaded.kind,
        role: file.role,
        definition: key,
        requested: requested.has(key),
        action: await actionFor(input, file.path, shipped, options.force === true),
      });
    }
  }
  const blocked = items.filter((item) => item.action === 'blocked').map((item) => item.path);
  if (blocked.length > 0) return unsafeRefusal(blocked);
  return { status: 'planned', plan: { mode, items } };
}

/** Write the files of a plan that are `create` or `overwrite`. Returns the paths written. */
export async function applyInstall(
  input: Pick<InstallInput, 'seed' | 'writer'>,
  plan: InstallPlan,
): Promise<string[]> {
  const written: string[] = [];
  for (const item of plan.items) {
    if (item.action !== 'create' && item.action !== 'overwrite') continue;
    const bytes = await bytesOf(
      input.seed,
      item.path,
      item.role === 'template' ? DEFINITION_TEMPLATE_FILE_MAX_BYTES : DEFINITION_FILE_MAX_BYTES,
    );
    try {
      // A file the plan saw as absent is created exclusively: one that appeared since is never replaced.
      await input.writer.writeAtomic(item.path, bytes, { exclusive: item.action === 'create' });
    } catch (error) {
      throw new DefinitionInstallError(
        'INSTALL_WRITE_FAILED',
        `Writing ${item.path} failed${error instanceof Error ? `: ${error.message}` : '.'}`,
        written,
      );
    }
    written.push(item.path);
  }
  return written;
}

/** Plan and (unless `dryRun` or refused) apply an install. */
export async function installDefinitions(input: InstallInput): Promise<InstallResult> {
  const outcome = await planInstall(input);
  if (outcome.status === 'refused' || input.options?.dryRun === true) {
    return { outcome, written: [] };
  }
  return { outcome, written: await applyInstall(input, outcome.plan) };
}
