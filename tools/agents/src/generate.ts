import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { loadAllAgents, providerSkillName } from './load.js';
import type { ContentMode, Provider, RenderedFile } from './model.js';
import { GENERATED_MARKER, renderSkill } from './render.js';

const PROVIDER_ROOTS: Record<Provider, string> = {
  claude: '.claude/skills',
  codex: '.agents/skills',
  antigravity: '.agents/skills',
};

export const DEFAULT_PROVIDERS: readonly Provider[] = ['claude', 'codex', 'antigravity'];

export function parseProviders(value: string | undefined): Provider[] {
  if (!value) return [...DEFAULT_PROVIDERS];
  const providers = [
    ...new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
  const known = new Set(DEFAULT_PROVIDERS);
  for (const provider of providers) {
    if (!known.has(provider as Provider)) throw new Error(`unknown provider '${provider}'`);
  }
  if (providers.length === 0) throw new Error('at least one provider is required');
  return providers as Provider[];
}

function uniqueProviderRoots(providers: readonly Provider[]): string[] {
  return [...new Set(providers.map((provider) => PROVIDER_ROOTS[provider]))].sort();
}

export function expectedFiles(
  repoRoot: string,
  providers: readonly Provider[],
  mode: ContentMode,
): RenderedFile[] {
  const agents = loadAllAgents(repoRoot);
  const files: RenderedFile[] = [];
  for (const root of uniqueProviderRoots(providers)) {
    for (const agent of agents) {
      const path = join(repoRoot, root, providerSkillName(agent.id), 'SKILL.md');
      files.push(renderSkill(repoRoot, agent, path, mode));
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function managedSkillDirectories(repoRoot: string, providerRoot: string): string[] {
  const root = resolve(repoRoot, providerRoot);
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('nevo-agents-'))
    .map((entry) => join(root, entry.name))
    .filter((dir) => {
      const skill = join(dir, 'SKILL.md');
      return existsSync(skill) && readFileSync(skill, 'utf8').includes(GENERATED_MARKER);
    });
}

export function buildAgents(
  repoRoot: string,
  providers: readonly Provider[],
  mode: ContentMode,
): void {
  const expected = expectedFiles(repoRoot, providers, mode);
  const expectedDirs = new Set(expected.map((file) => resolve(file.path, '..')));

  for (const providerRoot of uniqueProviderRoots(providers)) {
    for (const dir of managedSkillDirectories(repoRoot, providerRoot)) {
      if (!expectedDirs.has(resolve(dir))) rmSync(dir, { recursive: true, force: true });
    }
  }

  for (const file of expected) {
    mkdirSync(resolve(file.path, '..'), { recursive: true });
    writeFileSync(file.path, file.content, 'utf8');
  }
}

export function checkAgents(
  repoRoot: string,
  providers: readonly Provider[],
  mode: ContentMode,
): string[] {
  const problems: string[] = [];
  const expected = expectedFiles(repoRoot, providers, mode);
  const expectedPaths = new Set(expected.map((file) => resolve(file.path)));

  for (const file of expected) {
    if (!existsSync(file.path)) {
      problems.push(`missing: ${file.path}`);
      continue;
    }
    const actual = readFileSync(file.path, 'utf8').replace(/\r\n/g, '\n');
    if (actual !== file.content) problems.push(`stale: ${file.path}`);
  }

  for (const providerRoot of uniqueProviderRoots(providers)) {
    for (const dir of managedSkillDirectories(repoRoot, providerRoot)) {
      const skill = resolve(dir, 'SKILL.md');
      if (!expectedPaths.has(skill)) problems.push(`stale generated skill: ${skill}`);
    }
  }

  return problems;
}
