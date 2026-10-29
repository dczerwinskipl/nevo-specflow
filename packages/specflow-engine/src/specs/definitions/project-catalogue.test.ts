import { DEFINITION_PROBLEMS_MAX } from '@nevo/specflow-contracts/documents';
import { describe, expect, it } from 'vitest';

import { createDefaultDefinitionRegistry } from './kinds';
import { loadDefinitions } from './loader';
import { capProblems, resolveProjectCatalogue } from './project-catalogue';
import {
  archetypeFile,
  documentTypeFile,
  sampleProject,
  MemoryDefinitionSource,
} from './test-support';

async function resolve(source: MemoryDefinitionSource) {
  return resolveProjectCatalogue(await loadDefinitions(source, createDefaultDefinitionRegistry()));
}

describe('resolveProjectCatalogue', () => {
  it('resolves the valid definitions in id order with a revision', async () => {
    const project = await resolve(sampleProject());
    expect(project.catalogue.documentTypes.map((type) => type.id)).toEqual(['note', 'overview']);
    expect(project.catalogue.archetypes.map((archetype) => archetype.id)).toEqual(['minimal']);
    expect(project.catalogue.findTemplate('minimal', 'note')).toMatchObject({ preselected: true });
    expect(project.problems).toEqual([]);
    expect(project.problemsTruncated).toBe(false);
    expect(project.rootPresent).toBe(true);
  });

  it('freezes the catalogue', async () => {
    const { catalogue } = await resolve(sampleProject());
    expect(Object.isFrozen(catalogue.archetypes)).toBe(true);
    expect(Object.isFrozen(catalogue.archetypes[0]?.templates[0])).toBe(true);
  });

  it('is empty, not an error, for a project without definitions', async () => {
    const project = await resolve(new MemoryDefinitionSource());
    expect(project.catalogue.archetypes).toEqual([]);
    expect(project.catalogue.documentTypes).toEqual([]);
    expect(project.rootPresent).toBe(false);
  });

  it.each([
    [
      'a document type text',
      (s: MemoryDefinitionSource) =>
        s.set('document-type/note.yaml', documentTypeFile('note', { title: 'Notes' })),
    ],
    [
      'an archetype version',
      (s: MemoryDefinitionSource) =>
        s.set('specification-archetype/minimal.yaml', archetypeFile('minimal', { version: 2 })),
    ],
    [
      'a template file',
      (s: MemoryDefinitionSource) =>
        s.set('specification-archetype/templates/overview.md', '# changed\n'),
    ],
    [
      'a deleted definition',
      (s: MemoryDefinitionSource) => s.delete('specification-archetype/minimal.yaml'),
    ],
  ])('changes the revision when %s changes', async (_name, edit) => {
    const before = (await resolve(sampleProject())).catalogue.revision;
    const source = sampleProject();
    edit(source);
    expect((await resolve(source)).catalogue.revision).not.toBe(before);
  });

  it('does not change the revision for an invalid file that is not part of the catalogue', async () => {
    const before = (await resolve(sampleProject())).catalogue.revision;
    const source = sampleProject();
    source.set('document-type/broken.yaml', 'x: [');
    source.set('README.md', 'notes');
    const after = await resolve(source);
    expect(after.catalogue.revision).toBe(before);
    expect(after.problems).toHaveLength(2);
  });

  it('lists the ids of archetype files that were rejected', async () => {
    const source = sampleProject();
    source.set('specification-archetype/bad.yaml', 'x: [');
    expect((await resolve(source)).invalidArchetypeIds).toEqual(new Set(['bad']));
  });

  it('caps the problems, errors first, and says so', async () => {
    const source = sampleProject();
    for (let index = 0; index < 60; index += 1) {
      source.set(`document-type/w${String(index).padStart(2, '0')}.txt`, 'x');
    }
    for (let index = 0; index < 55; index += 1) {
      source.set(`document-type/e${String(index).padStart(2, '0')}.yaml`, 'x: [');
    }
    const project = await resolve(source);
    expect(project.problems).toHaveLength(DEFINITION_PROBLEMS_MAX);
    expect(project.problemsTruncated).toBe(true);
    expect(project.problems.every((problem) => problem.severity === 'error')).toBe(true);
  });

  it('puts warnings after errors when the cap leaves room', () => {
    const capped = capProblems([
      { source: 'b', code: 'unexpected-entry', severity: 'warning', message: 'w' },
      { source: 'z', code: 'yaml-invalid', severity: 'error', message: 'e' },
    ]);
    expect(capped.problems.map((problem) => problem.severity)).toEqual(['error', 'warning']);
    expect(capped.problemsTruncated).toBe(false);
  });
});
