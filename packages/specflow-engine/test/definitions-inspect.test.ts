// Real filesystem: the read-only views behind the `definitions` commands.
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  installProjectDefinitionFiles,
  listProjectDefinitions,
  showProjectDefinition,
  validateDefinitionsFolder,
  validateProjectDefinitions,
} from '../src/specs/definitions';
import type { SpecFlowEngine } from '../src/application';

let scratch: string;
let counter = 0;

beforeAll(async () => {
  scratch = await realpath(await mkdtemp(join(tmpdir(), 'nevo-inspect-')));
});
afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

async function installedHome(): Promise<{ home: string; engine: SpecFlowEngine }> {
  counter += 1;
  const home = join(scratch, `home-${counter}`);
  await mkdir(home, { recursive: true });
  await installProjectDefinitionFiles(home);
  return { home, engine: { context: { project: { homeRoot: home } } } as SpecFlowEngine };
}

const archetypeFile = (home: string, id: string) =>
  join(home, '.nevo', 'definitions', 'specification-archetype', `${id}.yaml`);

describe('listProjectDefinitions', () => {
  it('lists the shipped definitions with titles and versions, and no problems', async () => {
    const { engine } = await installedHome();
    const listing = await listProjectDefinitions(engine);
    expect(listing.rootPresent).toBe(true);
    expect(listing.problems).toEqual([]);
    expect(listing.hasErrors).toBe(false);
    expect(listing.definitions.filter((item) => item.kind === 'document-type')).toHaveLength(9);
    expect(listing.definitions.find((item) => item.id === 'feature')).toMatchObject({
      kind: 'specification-archetype',
      title: 'Feature',
      version: 1,
      source: 'specification-archetype/feature.yaml',
    });
    const only = await listProjectDefinitions(engine, { kind: 'specification-archetype' });
    expect(only.definitions.map((item) => item.id)).toEqual(['architecture', 'feature', 'minimal']);
    await expect(listProjectDefinitions(engine, { kind: 'nope' })).rejects.toThrow(
      /not a definition kind/u,
    );
  });

  it('names a rejected file as invalid and reports its problem', async () => {
    const { home, engine } = await installedHome();
    await writeFile(archetypeFile(home, 'feature'), 'kind: specification-archetype\n: [broken');
    const listing = await listProjectDefinitions(engine);
    expect(listing.invalid).toEqual(['specification-archetype/feature']);
    expect(listing.hasErrors).toBe(true);
    expect(listing.problems[0]).toMatchObject({ source: 'specification-archetype/feature.yaml' });
  });

  it('describes a project without definitions as empty', async () => {
    counter += 1;
    const home = join(scratch, `home-${counter}`);
    await mkdir(home, { recursive: true });
    const listing = await listProjectDefinitions({
      context: { project: { homeRoot: home } },
    } as SpecFlowEngine);
    expect(listing).toMatchObject({ rootPresent: false, definitions: [], problems: [] });
  });
});

describe('showProjectDefinition', () => {
  it('shows a valid definition, a rejected one with its problems, and an absent one', async () => {
    const { home, engine } = await installedHome();
    const valid = await showProjectDefinition(engine, 'document-type/overview');
    expect(valid).toMatchObject({ state: 'valid', id: 'overview' });
    await writeFile(archetypeFile(home, 'feature'), 'kind: specification-archetype\n: [broken');
    const invalid = await showProjectDefinition(engine, 'specification-archetype/feature');
    expect(invalid).toMatchObject({ state: 'invalid' });
    if (invalid.state === 'invalid') expect(invalid.problems.length).toBeGreaterThan(0);
    expect(await showProjectDefinition(engine, 'document-type/ghost')).toEqual({
      state: 'absent',
      kind: 'document-type',
      id: 'ghost',
    });
    await expect(showProjectDefinition(engine, 'nonsense')).rejects.toThrow(/<kind>\/<id>/u);
    await expect(showProjectDefinition(engine, 'task/x')).rejects.toThrow(/known kind/u);
  });
});

describe('validate', () => {
  it('agrees between the project view and a folder view of the same files', async () => {
    const { home, engine } = await installedHome();
    await writeFile(archetypeFile(home, 'feature'), 'kind: specification-archetype\n: [broken');
    const project = await validateProjectDefinitions(engine);
    const folder = await validateDefinitionsFolder(join(home, '.nevo', 'definitions'));
    expect(folder.problems).toEqual(project.problems);
    expect(project.hasErrors).toBe(true);
  });

  it('refuses a path that is not a folder', async () => {
    const { home } = await installedHome();
    await expect(validateDefinitionsFolder(archetypeFile(home, 'feature'))).rejects.toThrow(
      /not a folder/u,
    );
  });

  it('reports only warnings for an unknown entry and does not call that invalid', async () => {
    const { home, engine } = await installedHome();
    await writeFile(join(home, '.nevo', 'definitions', 'README.md'), 'hello');
    const report = await validateProjectDefinitions(engine);
    expect(report.hasErrors).toBe(false);
    expect(report.problems).toEqual([expect.objectContaining({ severity: 'warning' })]);
  });
});
