import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, link, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { parseDocument, stringify } from 'yaml';

import {
  installProjectDefinitionFiles,
  isGitIgnored,
  LOCAL_CONFIG_RELATIVE_PATH,
  LOCAL_IGNORE_ENTRY,
  type GitCheckoutLayout,
} from '@nevo/specflow-engine';

export interface ProjectConfigContribution {
  readonly projectConfig: Record<string, unknown>;
  readonly localConfig: Record<string, unknown>;
}

export interface ConfigWriteOptions {
  readonly local: boolean;
  /**
   * The content of the existing file this write replaces (a configuration without `runtime`, for
   * example with only `docs`); absent: the file must not exist.
   */
  readonly replaces?: string;
}

/** A configuration file that exists before init and that init completes instead of refusing. */
export interface ExistingConfigFile {
  readonly content: string;
  /** Its top-level section names. */
  readonly sections: readonly string[];
}

/** What init found: the existing files whose sections it keeps; absent: no file. */
export interface InitAdmission {
  readonly project?: ExistingConfigFile;
  readonly local?: ExistingConfigFile;
}

export interface InitializeProjectOptions {
  readonly layout: GitCheckoutLayout;
  /**
   * Write the shipped default definitions into `.nevo/definitions` (default true). They are written
   * before the configuration marker and removed again when initialization fails; committing them is the
   * caller's step, once the configuration exists.
   */
  readonly installDefinitions?: boolean;
  readonly contribution: ProjectConfigContribution;
  readonly isIgnored?: (root: string, relativePath: string) => Promise<boolean>;
  readonly writeConfigFile?: (
    path: string,
    content: string,
    options: ConfigWriteOptions,
  ) => Promise<void>;
}

export interface InitializeProjectResult {
  readonly root: string;
  /** Repository-relative paths of the definition files this initialization wrote (not yet committed). */
  readonly definitionPaths?: readonly string[];
  readonly projectConfigPath: string;
  readonly localConfigPath: string;
}

interface GitignoreSnapshot {
  readonly path: string;
  readonly existed: boolean;
  readonly content: string;
  readonly changed: boolean;
}

/**
 * Sections other than `runtime` that init may write into each file. An existing one is refused
 * before anything is asked, so a conflict never surfaces after the interactive flow. (`docs` and
 * `ai` are not here: init keeps an existing documentation configuration and does not ask about it.)
 */
const INIT_PROJECT_SECTIONS = ['git'] as const;
const INIT_LOCAL_SECTIONS = ['git'] as const;

/**
 * The `runtime` section marks an initialized project. A configuration without it (for example one
 * with only `docs`, which the `docs` commands use on their own) is completed: init adds its
 * sections and keeps the existing ones.
 */
export async function assertProjectCanInitialize(
  layout: GitCheckoutLayout,
): Promise<InitAdmission> {
  const project = await readExistingConfig(layout.projectConfigPath);
  if (project?.sections.includes('runtime')) {
    throw new Error(`Nevo SpecFlow is already initialized: ${layout.projectConfigPath}`);
  }

  const local = await readExistingConfig(layout.localConfigPath);
  if (local?.sections.includes('runtime')) {
    throw new Error(
      `Refusing to overwrite existing workstation-local SpecFlow config: ${layout.localConfigPath}`,
    );
  }

  assertNoInitSection(layout.projectConfigPath, project, INIT_PROJECT_SECTIONS);
  assertNoInitSection(layout.localConfigPath, local, INIT_LOCAL_SECTIONS);

  return { ...(project ? { project } : {}), ...(local ? { local } : {}) };
}

function assertNoInitSection(
  path: string,
  existing: ExistingConfigFile | undefined,
  sections: readonly string[],
): void {
  const section = sections.find((name) => existing?.sections.includes(name));
  if (section !== undefined) {
    throw new Error(sectionConflict(path, section));
  }
}

function sectionConflict(path: string, section: string): string {
  return `Refusing to overwrite the existing '${section}' section of ${path}; remove it and run init again.`;
}

async function readExistingConfig(path: string): Promise<ExistingConfigFile | undefined> {
  if (!(await fileExists(path))) {
    return undefined;
  }

  const content = await readFile(path, 'utf8');
  const document = parseDocument(content);
  const value: unknown = document.errors.length > 0 ? undefined : document.toJS();
  if (value !== null && !isRecord(value)) {
    throw new Error(`Cannot initialize: ${path} is not a valid YAML mapping.`);
  }

  return { content, sections: value === null ? [] : Object.keys(value) };
}

/** Add the contributed sections to an existing file, keeping its sections and comments. */
function completeConfig(
  path: string,
  existing: ExistingConfigFile,
  contribution: Record<string, unknown>,
): string {
  for (const section of Object.keys(contribution)) {
    if (existing.sections.includes(section)) {
      throw new Error(sectionConflict(path, section));
    }
  }

  const document = parseDocument(existing.content);
  if (document.contents === null) {
    // Empty, or only comments: keep them above the new sections.
    const kept = existing.content.trimEnd();

    return `${kept === '' ? '' : `${kept}\n`}${stringify(contribution, { lineWidth: 0 }).trimEnd()}\n`;
  }

  for (const [section, value] of Object.entries(contribution)) {
    document.set(section, document.createNode(value));
  }

  return `${document.toString({ lineWidth: 0 }).trimEnd()}\n`;
}

export async function initializeProject(
  options: InitializeProjectOptions,
): Promise<InitializeProjectResult> {
  const { layout } = options;
  const existing = await assertProjectCanInitialize(layout);

  // Composed before anything is written, so a section that already exists refuses init up front.
  const localContent = configContent(
    layout.localConfigPath,
    existing.local,
    options.contribution.localConfig,
  );
  const projectContent = configContent(
    layout.projectConfigPath,
    existing.project,
    options.contribution.projectConfig,
  );
  const checkIgnored = options.isIgnored ?? isGitIgnored;
  const writeConfig = options.writeConfigFile ?? defaultWriteConfigFile;

  const gitignore = await ensureLocalIgnore(layout.root, checkIgnored);
  let localWritten = false;
  let projectWritten = false;
  const definitionsFolder = join(layout.root, '.nevo', 'definitions');
  // Only a folder this run creates is removed again on failure.
  const definitionsExisted = await fileExists(definitionsFolder);
  let definitionPaths: string[] = [];

  try {
    await mkdir(dirname(layout.localConfigPath), { recursive: true });
    await mkdir(dirname(layout.projectConfigPath), { recursive: true });

    if (options.installDefinitions !== false) {
      const installed = await installProjectDefinitionFiles(layout.root);
      if (installed.outcome.status === 'refused' && installed.outcome.reason === 'target-unsafe') {
        throw new Error(installed.outcome.hint);
      }

      // A project that already has definitions (committed by its owner) keeps them: nothing was written.
      definitionPaths = installed.written.map((path) => `.nevo/definitions/${path}`);
    }

    // Local config may contain secrets, so write it only after Git ignore has been
    // proven effective. The committed config is written last and is the success marker.
    await writeConfig(layout.localConfigPath, localContent, {
      local: true,
      ...(existing.local ? { replaces: existing.local.content } : {}),
    });
    localWritten = true;

    await writeConfig(layout.projectConfigPath, projectContent, {
      local: false,
      ...(existing.project ? { replaces: existing.project.content } : {}),
    });
    projectWritten = true;
  } catch (error) {
    if (projectWritten) {
      await restoreConfig(layout.projectConfigPath, existing.project);
    }

    if (localWritten) {
      await restoreConfig(layout.localConfigPath, existing.local);
    }

    if (!definitionsExisted) {
      await rm(definitionsFolder, { recursive: true, force: true });
    }

    await restoreGitignore(gitignore);

    throw error;
  }

  return {
    root: layout.root,
    projectConfigPath: layout.projectConfigPath,
    localConfigPath: layout.localConfigPath,
    ...(definitionPaths.length > 0 ? { definitionPaths } : {}),
  };
}

function configContent(
  path: string,
  existing: ExistingConfigFile | undefined,
  contribution: Record<string, unknown>,
): string {
  return existing === undefined
    ? `${stringify(contribution, { lineWidth: 0 }).trimEnd()}\n`
    : completeConfig(path, existing, contribution);
}

/** Undo a write: remove a file init created, put back the content of one it completed. */
async function restoreConfig(
  path: string,
  existing: ExistingConfigFile | undefined,
): Promise<void> {
  if (existing === undefined) {
    await rm(path, { force: true });
  } else {
    await writeFile(path, existing.content, 'utf8');
  }
}

async function defaultWriteConfigFile(
  path: string,
  content: string,
  options: ConfigWriteOptions,
): Promise<void> {
  const stagedPath = `${path}.init.${randomUUID()}.tmp`;
  let published = false;

  try {
    await writeFile(stagedPath, content, {
      encoding: 'utf8',
      flag: 'wx',
      ...(options.local ? { mode: 0o600 } : {}),
    });

    if (options.replaces !== undefined) {
      // The file init completes must still be the one it read.
      if ((await readFile(path, 'utf8').catch(() => undefined)) !== options.replaces) {
        throw new Error(`Refusing to overwrite SpecFlow config that changed during init: ${path}`);
      }

      // Nothing to undo here: the rename is the last step and replaces the file at once.
      await rename(stagedPath, path);

      return;
    }

    try {
      await link(stagedPath, path);
      published = true;
    } catch (error) {
      if (isAlreadyExists(error)) {
        throw new Error(`Refusing to overwrite existing SpecFlow config: ${path}`, {
          cause: error,
        });
      }

      throw error;
    }

    await rm(stagedPath, { force: true });
  } catch (error) {
    if (published) {
      await rm(path, { force: true });
    }

    await rm(stagedPath, { force: true });

    throw error;
  }
}

async function ensureLocalIgnore(
  root: string,
  checkIgnored: (root: string, relativePath: string) => Promise<boolean>,
): Promise<GitignoreSnapshot> {
  const gitignorePath = join(root, '.gitignore');
  const existed = await fileExists(gitignorePath);
  const original = existed ? await readFile(gitignorePath, 'utf8') : '';
  let current = original;

  const lines = current.split(/\r?\n/u).map((line) => line.trim());
  if (!lines.includes(LOCAL_IGNORE_ENTRY)) {
    current = appendIgnoreRule(current);
    await writeFile(gitignorePath, current, 'utf8');
  }

  if (!(await checkIgnored(root, LOCAL_CONFIG_RELATIVE_PATH))) {
    if (current === original || !current.trimEnd().endsWith(LOCAL_IGNORE_ENTRY)) {
      current = appendIgnoreRule(current);
      await writeFile(gitignorePath, current, 'utf8');
    }

    if (!(await checkIgnored(root, LOCAL_CONFIG_RELATIVE_PATH))) {
      const snapshot = {
        path: gitignorePath,
        existed,
        content: original,
        changed: current !== original,
      };
      await restoreGitignore(snapshot);

      throw new Error(
        `Refusing to write workstation-local secrets because Git does not ignore ${LOCAL_CONFIG_RELATIVE_PATH}.`,
      );
    }
  }

  return {
    path: gitignorePath,
    existed,
    content: original,
    changed: current !== original,
  };
}

function appendIgnoreRule(content: string): string {
  const prefix = content.length === 0 ? '' : content.endsWith('\n') ? content : `${content}\n`;
  const separator = prefix.length === 0 || prefix.endsWith('\n\n') ? '' : '\n';

  return (
    `${prefix}${separator}# Nevo SpecFlow workstation-local configuration and state\n` +
    `${LOCAL_IGNORE_ENTRY}\n`
  );
}

async function restoreGitignore(snapshot: GitignoreSnapshot): Promise<void> {
  if (!snapshot.changed) {
    return;
  }

  if (snapshot.existed) {
    await writeFile(snapshot.path, snapshot.content, 'utf8');
  } else {
    await rm(snapshot.path, { force: true });
  }
}

function isAlreadyExists(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'EEXIST'
  );
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);

    return true;
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT'
    ) {
      return false;
    }

    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
