import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { SpecFlowEngine } from '../../application';
import type { ProjectCatalogue } from '../definitions/project-catalogue';
import { installProjectDefinitionFiles } from '../definitions/install-project';
import { seedCatalogueForTesting } from '../definitions/testing-install';
import { TEXT_CONTENT_MAX_BYTES } from '../documents';
import { ADDED_DOCUMENTS_MAX_FILES } from './limits';
import { admitCreateArchetype, resolveCreateArchetype } from './admission';
import { normalizeCreateClientIntent, type CreateClientIntentInput } from './intent';

const catalogue = await seedCatalogueForTesting();
const project: ProjectCatalogue = {
  catalogue,
  problems: [],
  problemsTruncated: false,
  rootPresent: true,
  invalidArchetypeIds: new Set(),
};
const target = { kind: 'existing', workspaceId: '11111111-1111-4111-8111-111111111111' } as const;
const EURO = '€';

function admit(patch: Partial<CreateClientIntentInput> = {}): void {
  const input: CreateClientIntentInput = {
    title: 'Checkout',
    archetype: { id: 'feature', version: 1 },
    target,
    ...patch,
  };
  admitCreateArchetype(
    normalizeCreateClientIntent(input),
    (input.addedDocuments ?? []).map((document) => document.content),
    project,
  );
}

describe('Create admission of the archetype part', () => {
  it('accepts a valid request, with the current revision', () => {
    expect(() =>
      admit({
        catalogueRevision: catalogue.revision,
        optionalDocumentIds: ['ux'],
        addedDocuments: [{ path: 'notes/a.md', type: 'note', content: 'x' }],
        folders: ['assets'],
      }),
    ).not.toThrow();
  });

  it('accepts a request without a revision (checked only when present)', () => {
    expect(() => admit()).not.toThrow();
  });

  it('refuses a stale revision as CATALOGUE_STALE, ahead of any other refusal', () => {
    expect(() =>
      admit({ catalogueRevision: 'old', archetype: { id: 'gone', version: 9 } }),
    ).toThrowError(expect.objectContaining({ code: 'CATALOGUE_STALE' }));
  });

  it('refuses a stale archetype version as CATALOGUE_STALE', () => {
    expect(() => admit({ archetype: { id: 'feature', version: 2 } })).toThrowError(
      expect.objectContaining({ code: 'CATALOGUE_STALE' }),
    );
  });

  it('refuses an unknown archetype and an unknown or non-optional template as ARCHETYPE_UNKNOWN', () => {
    for (const patch of [
      { archetype: { id: 'nope', version: 1 } },
      { optionalDocumentIds: ['missing'] },
      { optionalDocumentIds: ['overview'] },
    ]) {
      expect(() => admit(patch)).toThrowError(
        expect.objectContaining({ code: 'ARCHETYPE_UNKNOWN' }),
      );
    }
  });

  it('refuses a reserved or invalid path as DOCUMENT_PATH_INVALID', () => {
    for (const path of [
      'specification.yaml',
      'SPECIFICATION.YAML',
      '../x.md',
      'a/CON.md',
      '',
      'x'.repeat(201) + '.md',
    ]) {
      expect(() => admit({ addedDocuments: [{ path, content: '' }] })).toThrowError(
        expect.objectContaining({ code: 'DOCUMENT_PATH_INVALID' }),
      );
    }
  });

  it('refuses invisible, bidi and lone-surrogate names as DOCUMENT_PATH_INVALID', () => {
    for (const path of [
      'zw' + String.fromCharCode(0x200b) + 'sp.md',
      'bidi' + String.fromCharCode(0x202e) + 'evil.md',
      'x' + String.fromCharCode(0xd800) + '.md',
    ]) {
      expect(() => admit({ addedDocuments: [{ path, content: '' }] })).toThrowError(
        expect.objectContaining({ code: 'DOCUMENT_PATH_INVALID' }),
      );
      expect(() => admit({ folders: [path.replace('.md', '')] })).toThrowError(
        expect.objectContaining({ code: 'DOCUMENT_PATH_INVALID' }),
      );
    }
  });

  it('refuses a folder below an unregistered added file as DOCUMENT_PATH_CONFLICT', () => {
    expect(() =>
      admit({ addedDocuments: [{ path: 'a.md', content: '' }], folders: ['a.md/x'] }),
    ).toThrowError(expect.objectContaining({ code: 'DOCUMENT_PATH_CONFLICT' }));
  });

  it('refuses a case-insensitive duplicate as DOCUMENT_PATH_CONFLICT', () => {
    expect(() =>
      admit({
        addedDocuments: [
          { path: 'a.md', content: '' },
          { path: 'A.md', content: '' },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: 'DOCUMENT_PATH_CONFLICT' }));
    expect(() => admit({ addedDocuments: [{ path: 'OVERVIEW.md', content: '' }] })).toThrowError(
      expect.objectContaining({ code: 'DOCUMENT_PATH_CONFLICT' }),
    );
  });

  it('refuses counts and UTF-8 byte sizes above the limits as DOCUMENT_OPERATION_INVALID', () => {
    const tooMany = Array.from({ length: ADDED_DOCUMENTS_MAX_FILES + 1 }, (_, index) => ({
      path: `f${index}.md`,
      content: '',
    }));
    expect(() => admit({ addedDocuments: tooMany })).toThrowError(
      expect.objectContaining({ code: 'DOCUMENT_OPERATION_INVALID' }),
    );
    // Three bytes per character: under the limit in characters, over it in bytes.
    const fitting = Math.floor(TEXT_CONTENT_MAX_BYTES / 3);
    expect(fitting + 1).toBeLessThan(TEXT_CONTENT_MAX_BYTES);
    expect(() =>
      admit({ addedDocuments: [{ path: 'big.md', content: EURO.repeat(fitting + 1) }] }),
    ).toThrowError(expect.objectContaining({ code: 'DOCUMENT_OPERATION_INVALID' }));
    expect(() =>
      admit({ addedDocuments: [{ path: 'ok.md', content: EURO.repeat(fitting) }] }),
    ).not.toThrow();
  });

  it('refuses an added document type that cannot be registered as DOCUMENT_OPERATION_INVALID', () => {
    for (const type of ['u', 'u-abc', 'Bad Type']) {
      expect(() => admit({ addedDocuments: [{ path: 'a.md', type, content: '' }] })).toThrowError(
        expect.objectContaining({ code: 'DOCUMENT_OPERATION_INVALID' }),
      );
    }
  });

  it('refuses contents that do not match the intent evidence', () => {
    const intent = normalizeCreateClientIntent({
      title: 'Checkout',
      archetype: { id: 'feature', version: 1 },
      target,
      addedDocuments: [{ path: 'a.md', content: 'x' }],
    });
    expect(() => admitCreateArchetype(intent, ['y'], project)).toThrowError(
      expect.objectContaining({ code: 'CREATE_OPERATION_INVALID' }),
    );
    expect(() => admitCreateArchetype(intent, [], project)).toThrowError(
      expect.objectContaining({ code: 'CREATE_OPERATION_INVALID' }),
    );
  });
});

describe('resolveCreateArchetype', () => {
  const homes: string[] = [];
  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  async function engineAt(options: {
    seeds: boolean;
  }): Promise<{ engine: SpecFlowEngine; home: string }> {
    const home = await mkdtemp(join(tmpdir(), 'specflow-resolve-archetype-'));
    homes.push(home);
    if (options.seeds) await installProjectDefinitionFiles(home);
    return { engine: { context: { project: { homeRoot: home } } } as SpecFlowEngine, home };
  }

  it('resolves the current version and the catalogue revision of the project definitions', async () => {
    const { engine } = await engineAt({ seeds: true });
    expect(await resolveCreateArchetype(engine, 'feature')).toEqual({
      archetype: { id: 'feature', version: 1 },
      catalogueRevision: catalogue.revision,
    });
  });

  it('refuses an unknown archetype as ARCHETYPE_UNKNOWN instead of inventing a version', async () => {
    const { engine } = await engineAt({ seeds: true });
    await expect(resolveCreateArchetype(engine, 'nope')).rejects.toMatchObject({
      code: 'ARCHETYPE_UNKNOWN',
      details: { cause: 'archetype-not-defined' },
    });
  });

  it('names an archetype whose file is rejected as archetype-invalid', async () => {
    const { engine, home } = await engineAt({ seeds: true });
    await writeFile(
      join(home, '.nevo', 'definitions', 'specification-archetype', 'feature.yaml'),
      'kind: specification-archetype\nschemaVersion: 1\nid: feature\n',
    );
    await expect(resolveCreateArchetype(engine, 'feature')).rejects.toMatchObject({
      code: 'ARCHETYPE_UNKNOWN',
      details: { cause: 'archetype-invalid' },
    });
  });

  it('answers DEFINITIONS_MISSING for a project without definitions', async () => {
    const { engine } = await engineAt({ seeds: false });
    await expect(resolveCreateArchetype(engine, 'feature')).rejects.toMatchObject({
      code: 'DEFINITIONS_MISSING',
      details: { cause: 'definitions-missing' },
    });
  });
});

describe('admission without a usable archetype', () => {
  it('reports DEFINITIONS_MISSING before a stale revision', () => {
    const empty: ProjectCatalogue = {
      ...project,
      catalogue: { ...catalogue, archetypes: [], revision: 'empty' },
    };
    const intent = normalizeCreateClientIntent({
      title: 'Checkout',
      archetype: { id: 'feature', version: 1 },
      catalogueRevision: 'old',
      target,
    });
    expect(() => admitCreateArchetype(intent, [], empty)).toThrowError(
      expect.objectContaining({ code: 'DEFINITIONS_MISSING' }),
    );
  });
});
