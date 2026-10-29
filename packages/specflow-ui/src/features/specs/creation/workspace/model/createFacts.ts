import type { CreateOptions } from '@nevo/specflow-contracts/specs';
import { branchPreview, createOverrides, effectiveSlug } from './createRequest';
import type { WorkspaceChoice } from './workspaceChoice';
import { activeTile, primaryWorkspace, targetStatus } from './workspaceTiles';

/** A workspace as the owner saw it in the form: its name (folder) and, if any, its branch. */
export interface FactWorkspace {
  readonly name: string;
  readonly branch?: string;
}

/**
 * What this Create does, in the words the form used, kept with the draft when the form hands over
 * to the progress page. Plain values copied from the create-options the owner chose from (never
 * server text of the operation), so the page can say where the specification goes without asking
 * the server again. A value that was not known is absent, never guessed.
 */
export interface CreateSettingsFacts {
  readonly place: 'new' | 'existing' | 'main';
  /** The workspace the specification is added to (`existing`, `main`). */
  readonly workspace?: FactWorkspace;
  /** New workspace: the branch it starts from; `baseHead` when that is the current commit. */
  readonly base?: string;
  readonly baseHead?: boolean;
  /** New workspace: the branch name (the generated one is shown like the form shows it). */
  readonly branch?: string;
  /** New workspace: the folder worktrees are created in. */
  readonly folder?: string;
  /** New workspace: where the changes will be merged later. */
  readonly mergeInto?: FactWorkspace;
  /** Why `mergeInto` cannot take a merge now (a reason code), when it cannot. */
  readonly mergeReason?: string;
  /** The specification slug when the owner set it explicitly. */
  readonly slug?: string;
  /** Git is enabled: the Engine commits the specification files (to `branch` or the workspace's). */
  readonly commit?: true;
}

const named = (workspace: CreateOptions['workspaces'][number]): FactWorkspace => ({
  name: workspace.name,
  ...(workspace.branch ? { branch: workspace.branch } : {}),
});

/** The facts of the form's current choice; undefined when no tile applies. */
export function buildCreateFacts(
  choice: WorkspaceChoice,
  options: CreateOptions,
  title: string,
): CreateSettingsFacts | undefined {
  const tile = activeTile(choice, options);
  const commit = options.commits ? ({ commit: true } as const) : {};
  if (tile === 'existing') {
    const selected = options.workspaces.find((w) => w.workspaceId === choice.existingWorkspaceId);

    return { place: 'existing', ...(selected ? { workspace: named(selected) } : {}), ...commit };
  }

  if (tile === 'main') {
    const primary = primaryWorkspace(options);

    return { place: 'main', ...(primary ? { workspace: named(primary) } : {}), ...commit };
  }

  if (tile !== 'new') {
    return undefined;
  }

  const overrides = createOverrides(choice, options, title);
  const primary = primaryWorkspace(options);
  const base =
    overrides.baseRef ??
    (options.defaultBaseRef === 'HEAD' ? primary?.branch : options.defaultBaseRef);
  const picked = choice.target.on
    ? options.workspaces.find((w) => w.workspaceId === choice.target.workspaceId)
    : undefined;
  const status = targetStatus(options);
  const mergeInto =
    picked ??
    (status.kind === 'ok' || status.kind === 'unavailable' ? status.workspace : undefined);
  const mergeReason =
    !picked && status.kind === 'unavailable' ? (status.workspace.reason ?? 'other') : undefined;

  return {
    place: 'new',
    ...(base ? { base } : { baseHead: true }),
    branch: overrides.branch ?? branchPreview(options, effectiveSlug(choice, title)),
    folder: options.worktreesRoot.path,
    ...(mergeInto ? { mergeInto: named(mergeInto) } : {}),
    ...(mergeReason ? { mergeReason } : {}),
    ...(overrides.slug ? { slug: overrides.slug } : {}),
    ...commit,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

function factWorkspace(value: unknown): FactWorkspace | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const name = text(value.name);
  const branch = text(value.branch);

  return name ? { name, ...(branch ? { branch } : {}) } : undefined;
}

/** Reads stored facts defensively: a damaged value is dropped, a damaged part is left out. */
export function toCreateFacts(value: unknown): CreateSettingsFacts | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (value.place !== 'new' && value.place !== 'existing' && value.place !== 'main') {
    return undefined;
  }

  const workspace = factWorkspace(value.workspace);
  const mergeInto = factWorkspace(value.mergeInto);
  const base = text(value.base);
  const branch = text(value.branch);
  const folder = text(value.folder);
  const mergeReason = text(value.mergeReason);
  const slug = text(value.slug);

  return {
    place: value.place,
    ...(workspace ? { workspace } : {}),
    ...(base ? { base } : {}),
    ...(value.baseHead === true ? { baseHead: true } : {}),
    ...(branch ? { branch } : {}),
    ...(folder ? { folder } : {}),
    ...(mergeInto ? { mergeInto } : {}),
    ...(mergeReason ? { mergeReason } : {}),
    ...(slug ? { slug } : {}),
    ...(value.commit === true ? { commit: true as const } : {}),
  };
}
