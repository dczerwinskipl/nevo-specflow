import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { demoArchetypes, creationCatalogue } from './catalogue';
import { seedArchetypes, seedDocumentTypes } from './definitions';

const seeds = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'specflow-engine',
  'definitions',
);

function readKind(kind: string): Record<string, unknown>[] {
  return readdirSync(join(seeds, kind))
    .filter((name) => name.endsWith('.yaml'))
    .sort()
    .map((name) => {
      const {
        kind: _kind,
        schemaVersion: _version,
        ...rest
      } = parse(readFileSync(join(seeds, kind, name), 'utf8')) as Record<string, unknown>;

      return rest;
    });
}

describe('demo definitions', () => {
  it('are the Engine seeds that `definitions install` writes (texts and templates not invented)', () => {
    expect(seedDocumentTypes).toEqual(readKind('document-type'));
    const archetypes = readKind('specification-archetype').map((archetype) => ({
      ...archetype,
      templates: (archetype.templates as Record<string, unknown>[]).map(
        ({ contentFile, ...template }) => ({
          ...template,
          content:
            typeof contentFile === 'string'
              ? readFileSync(join(seeds, 'specification-archetype', contentFile), 'utf8')
              : template.content,
        }),
      ),
    }));
    expect(seedArchetypes).toEqual(archetypes);
  });

  it('serve the real catalogue shape plus the demo owner archetype and the demo default', () => {
    expect(demoArchetypes.archetypes.map((archetype) => archetype.id)).toEqual([
      'architecture',
      'feature',
      'minimal',
      'cross-module',
    ]);
    expect(creationCatalogue.revision).toBe(demoArchetypes.revision);
    expect(creationCatalogue.defaultArchetypeId).toBe('feature');
    expect(creationCatalogue).not.toHaveProperty('workflow');
    for (const archetype of creationCatalogue.archetypes) {
      expect(Number.isInteger(archetype.version)).toBe(true);
    }
  });
});
