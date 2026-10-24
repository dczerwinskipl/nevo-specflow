import { createHash } from 'node:crypto';

import type { ArchetypeDefinitionFile } from '@nevo/specflow-contracts/documents';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

import goldenFixtures from './archetypes/fixtures/overview-golden.json';
import { BUILT_IN_DEFINITIONS } from './archetypes/builtins';
import { getBuiltInCatalogue, resolveCatalogue } from './archetypes/catalogue';
import { deriveUnclassifiedDocumentId } from './documents/document-ids';
import {
  ADDED_DOCUMENTS_MAX_FILES,
  ADDED_DOCUMENTS_MAX_FOLDERS,
  ADDED_DOCUMENTS_MAX_TOTAL_BYTES,
  TEXT_CONTENT_MAX_BYTES,
} from './documents/limits';
import { archivedManifestText } from './lifecycle/archive-effects';
import { parseSpecificationManifestText } from './model';
import {
  ScaffoldValidationError,
  createSpecificationScaffold,
  type ScaffoldValidationCause,
  type SpecificationScaffoldInput,
} from './scaffold';

const SPEC_ID = '11111111-2222-4333-8444-555555555555';
const base = {
  specId: SPEC_ID,
  title: 'My feature',
  created: '2026-10-24',
  goal: 'Make it work.',
} as const;

const input = (
  overrides: Partial<SpecificationScaffoldInput> & { archetypeId: string },
): SpecificationScaffoldInput => ({ ...base, ...overrides });

function causeOf(overrides: Partial<SpecificationScaffoldInput> & { archetypeId: string }) {
  try {
    createSpecificationScaffold(input(overrides));
  } catch (error) {
    expect(error).toBeInstanceOf(ScaffoldValidationError);
    const failure = error as ScaffoldValidationError;
    expect(failure.code).toBe('SPEC_VALIDATION_ERROR');
    expect(failure.message).not.toMatch(/[A-Za-z]:\\|\/home\/|\/tmp\//u);
    return failure.cause;
  }
  throw new Error('Expected the scaffold to be refused.');
}

const manifestOf = (scaffold: ReturnType<typeof createSpecificationScaffold>) =>
  parseSpecificationManifestText(scaffold.files[0]!.content, scaffold.slug, 'active');

describe('createSpecificationScaffold', () => {
  it('scaffolds each archetype and parses back to an equal model', () => {
    const catalogue = getBuiltInCatalogue();
    for (const archetype of catalogue.archetypes) {
      const optional = archetype.templates
        .filter((template) => template.include === 'optional')
        .map((template) => template.id);
      for (const optionalDocumentIds of [[], optional]) {
        const scaffold = createSpecificationScaffold(
          input({
            archetypeId: archetype.id,
            optionalDocumentIds,
            folders: ['research', 'notes/a'],
          }),
        );
        const manifest = manifestOf(scaffold);
        expect(manifest.archetype).toEqual({
          id: archetype.id,
          version: archetype.version,
          requirements: archetype.requirements,
        });
        expect(manifest.documents.map((item) => item.type)).toEqual([
          'overview',
          ...optionalDocumentIds.map(
            (id) => catalogue.findTemplate(archetype.id, id)!.documentType,
          ),
        ]);
        expect(manifest.folders).toEqual(['notes/a', 'research']);
        expect(scaffold.documentIds).toEqual(manifest.documents.map((item) => item.id));
        expect(manifest).toMatchObject({
          specId: SPEC_ID,
          slug: scaffold.slug,
          title: 'My feature',
          status: 'draft',
          priority: 10,
          created: '2026-10-24',
          tasks: [],
          location: 'active',
        });
      }
    }
  });

  it('orders files manifest first, then catalogue order, then added documents', () => {
    const scaffold = createSpecificationScaffold(
      input({
        archetypeId: 'feature',
        optionalDocumentIds: ['backend', 'behaviour'],
        addedDocuments: [
          { path: 'z-extra.md', content: 'z' },
          { path: 'a-extra.md', type: 'note', content: 'a' },
        ],
      }),
    );
    expect(scaffold.files.map((file) => file.relativePath)).toEqual([
      'specs/active/my-feature/specification.yaml',
      'specs/active/my-feature/overview.md',
      'specs/active/my-feature/behaviour.md',
      'specs/active/my-feature/backend.md',
      'specs/active/my-feature/z-extra.md',
      'specs/active/my-feature/a-extra.md',
    ]);
    for (const file of scaffold.files) {
      expect(file.sha256).toBe(createHash('sha256').update(file.content, 'utf8').digest('hex'));
    }
  });

  it('is deterministic whatever the order of optionalDocumentIds', () => {
    const first = createSpecificationScaffold(
      input({ archetypeId: 'feature', optionalDocumentIds: ['ux', 'behaviour', 'ux'] }),
    );
    const second = createSpecificationScaffold(
      input({ archetypeId: 'feature', optionalDocumentIds: ['behaviour', 'ux'] }),
    );
    expect(second).toEqual(first);
    expect(first.documentIds).toEqual(['overview', 'behaviour', 'ux']);
  });

  it('always scaffolds the fixed overview first and never needs a suggestion', () => {
    for (const archetypeId of ['minimal', 'feature', 'architecture']) {
      const scaffold = createSpecificationScaffold(input({ archetypeId }));
      expect(manifestOf(scaffold).documents).toEqual([
        { id: 'overview', path: 'overview.md', type: 'overview' },
      ]);
      expect(scaffold.files).toHaveLength(2);
    }
  });

  describe('overview equals the pre-change scaffold (golden fixtures)', () => {
    it.each(goldenFixtures)('$name', (fixture) => {
      for (const archetypeId of ['minimal', 'feature', 'architecture']) {
        const scaffold = createSpecificationScaffold({
          archetypeId,
          ...(fixture.input as Omit<SpecificationScaffoldInput, 'archetypeId'>),
        });
        expect(scaffold.slug).toBe(fixture.slug);
        expect(scaffold.files[1]!.content).toBe(fixture.overview);
      }
    });
  });

  it('renders suggested templates from the catalogue', () => {
    const scaffold = createSpecificationScaffold(
      input({ archetypeId: 'feature', optionalDocumentIds: ['behaviour'] }),
    );
    expect(scaffold.files[2]!.content).toBe(
      '# My feature - Behaviour\n\n## Scenarios\n\n## Rules\n\n## Edge cases\n\n## Acceptance scenarios\n',
    );
  });

  it('allocates deterministic suffixed ids for a second document of one type', () => {
    const user: ArchetypeDefinitionFile = {
      schemaVersion: 1,
      archetypes: [
        {
          id: 'twins',
          version: 1,
          title: 'Twins',
          description: 'Two notes.',
          useWhen: 'Never.',
          requirements: [{ documentType: 'overview', minCount: 1 }],
          templates: [
            ...BUILT_IN_DEFINITIONS.archetypes![0]!.templates.slice(0, 1),
            {
              id: 'note-a',
              documentType: 'note',
              filename: 'note-a.md',
              include: 'optional',
              content: 'a',
            },
            {
              id: 'note-b',
              documentType: 'note',
              filename: 'note-b.md',
              include: 'optional',
              content: 'b',
            },
          ],
        },
      ],
    };
    const catalogue = resolveCatalogue(BUILT_IN_DEFINITIONS, user);
    const build = () =>
      createSpecificationScaffold(
        input({ archetypeId: 'twins', optionalDocumentIds: ['note-a', 'note-b'], catalogue }),
      );
    const ids = build().documentIds;
    expect(ids).toHaveLength(3);
    expect(ids[1]).toBe('note');
    expect(ids[2]).toMatch(/^note-[a-z2-7]{6}$/u);
    expect(build().documentIds).toEqual(ids);
  });

  describe('added documents', () => {
    it('registers typed ones and leaves untyped ones unclassified', () => {
      const scaffold = createSpecificationScaffold(
        input({
          archetypeId: 'minimal',
          addedDocuments: [
            { path: 'research/findings.md', type: 'research', content: '# F' },
            { path: 'raw/data.csv', content: 'a,b' },
          ],
        }),
      );
      const manifest = manifestOf(scaffold);
      expect(manifest.documents).toEqual([
        { id: 'overview', path: 'overview.md', type: 'overview' },
        { id: 'research', path: 'research/findings.md', type: 'research' },
      ]);
      expect(scaffold.files.map((file) => file.relativePath)).toContain(
        'specs/active/my-feature/raw/data.csv',
      );
      expect(deriveUnclassifiedDocumentId('raw/data.csv')).toMatch(/^u-/u);
    });

    it('registers a typed document of a type unknown to the catalogue (retired types stay valid)', () => {
      const scaffold = createSpecificationScaffold(
        input({
          archetypeId: 'minimal',
          addedDocuments: [{ path: 'x.md', type: 'retired-type', content: 'x' }],
        }),
      );
      expect(manifestOf(scaffold).documents[1]).toMatchObject({ type: 'retired-type' });
    });
  });

  describe('refusals carry a structured cause', () => {
    it('unknown archetype', () => {
      expect(causeOf({ archetypeId: 'nope' })).toEqual({ kind: 'archetype-unknown', id: 'nope' });
    });

    it.each(['ghost', 'overview', 'backend'])('unknown or non-optional template %s', (id) => {
      expect(causeOf({ archetypeId: 'minimal', optionalDocumentIds: [id] })).toEqual({
        kind: 'template-unknown',
        id,
      });
    });

    it.each([
      ['../x.md', 'traversal'],
      ['specification.yaml', 'reserved-name'],
      ['Change.YAML', 'reserved-name'],
      ['con.md', 'device-name'],
      ['a\u0000.md', 'control-character'],
      ['a:b.md', 'forbidden-character'],
      ['/abs.md', 'absolute'],
    ])('invalid added path %j', (path, violation) => {
      expect(causeOf({ archetypeId: 'minimal', addedDocuments: [{ path, content: '' }] })).toEqual({
        kind: 'path-invalid',
        path,
        violation,
      });
    });

    it('invalid folder path', () => {
      expect(causeOf({ archetypeId: 'minimal', folders: ['a/../b'] })).toMatchObject({
        kind: 'path-invalid',
        path: 'a/../b',
      });
    });

    it('added documents of type u are refused for the first and every later one', () => {
      for (const count of [1, 2]) {
        expect(
          causeOf({
            archetypeId: 'minimal',
            addedDocuments: Array.from({ length: count }, (_, i) => ({
              path: `u${i}.md`,
              type: 'u',
              content: '',
            })),
          }),
        ).toMatchObject({ kind: 'type-invalid', type: 'u' });
      }
    });

    it('invalid added type', () => {
      expect(
        causeOf({
          archetypeId: 'minimal',
          addedDocuments: [{ path: 'x.md', type: 'Bad Type', content: '' }],
        }),
      ).toEqual({ kind: 'type-invalid', path: 'x.md', type: 'Bad Type' });
      expect(
        causeOf({
          archetypeId: 'minimal',
          addedDocuments: [{ path: 'x.md', type: 'u-thing', content: '' }],
        }),
      ).toEqual({ kind: 'type-invalid', path: 'x.md', type: 'u-thing' });
    });

    it.each([
      [
        'an added file and a scaffold file ignoring case',
        { addedDocuments: [{ path: 'OVERVIEW.md', content: '' }] },
      ],
      [
        'two added files ignoring case',
        {
          addedDocuments: [
            { path: 'a.md', content: '' },
            { path: 'A.md', content: '' },
          ],
        },
      ],
      ['a folder and a file ignoring case', { folders: ['Overview.md'] }],
      [
        'a file used as a folder',
        {
          addedDocuments: [
            { path: 'notes', content: '' },
            { path: 'notes/a.md', content: '' },
          ],
        },
      ],
      ['two folders ignoring case', { folders: ['research', 'Research'] }],
    ])('path conflict: %s', (_name, extra) => {
      const cause: ScaffoldValidationCause = causeOf({ archetypeId: 'minimal', ...extra });
      expect(cause.kind).toBe('path-conflict');
    });

    it('Create limits', () => {
      const file = { path: 'x.md', content: '' };
      expect(
        causeOf({
          archetypeId: 'minimal',
          addedDocuments: Array.from({ length: ADDED_DOCUMENTS_MAX_FILES + 1 }, (_, i) => ({
            ...file,
            path: `f${i}.md`,
          })),
        }),
      ).toMatchObject({ kind: 'limit-exceeded', limit: 'added-files' });
      expect(
        causeOf({
          archetypeId: 'minimal',
          folders: Array.from({ length: ADDED_DOCUMENTS_MAX_FOLDERS + 1 }, (_, i) => `d${i}`),
        }),
      ).toMatchObject({ kind: 'limit-exceeded', limit: 'added-folders' });
      expect(
        causeOf({
          archetypeId: 'minimal',
          addedDocuments: [{ path: 'big.md', content: 'x'.repeat(TEXT_CONTENT_MAX_BYTES + 1) }],
        }),
      ).toMatchObject({ kind: 'limit-exceeded', limit: 'file-bytes', path: 'big.md' });
      const half = 'x'.repeat(ADDED_DOCUMENTS_MAX_TOTAL_BYTES / 2 + 1);
      expect(
        causeOf({
          archetypeId: 'minimal',
          addedDocuments: [
            { path: 'a.md', content: half },
            { path: 'b.md', content: half },
          ],
        }),
      ).toMatchObject({ kind: 'limit-exceeded', limit: 'added-total-bytes' });
    });

    it('counts bytes, not characters', () => {
      const content = 'ż'.repeat(TEXT_CONTENT_MAX_BYTES / 2 + 1);
      expect(content.length).toBeLessThan(TEXT_CONTENT_MAX_BYTES);
      expect(
        causeOf({ archetypeId: 'minimal', addedDocuments: [{ path: 'a.md', content }] }),
      ).toMatchObject({ limit: 'file-bytes' });
    });

    it('a rendered template above the template limit', () => {
      expect(causeOf({ archetypeId: 'minimal', goal: 'g'.repeat(70 * 1024) })).toMatchObject({
        kind: 'limit-exceeded',
        limit: 'template-bytes',
        path: 'overview.md',
      });
    });
  });

  it('accepts the maximum added documents and folders', () => {
    const scaffold = createSpecificationScaffold(
      input({
        archetypeId: 'minimal',
        addedDocuments: Array.from({ length: ADDED_DOCUMENTS_MAX_FILES }, (_, i) => ({
          path: `f${i}.md`,
          content: 'x',
        })),
        folders: Array.from({ length: ADDED_DOCUMENTS_MAX_FOLDERS }, (_, i) => `d${i}`),
      }),
    );
    expect(manifestOf(scaffold).folders).toHaveLength(ADDED_DOCUMENTS_MAX_FOLDERS);
  });

  it('keeps the existing identity, title and slug validation', () => {
    expect(() =>
      createSpecificationScaffold(input({ archetypeId: 'minimal', specId: 'x' })),
    ).toThrow(/specId/u);
    expect(() =>
      createSpecificationScaffold(input({ archetypeId: 'minimal', title: ' ' })),
    ).toThrow(/Title/u);
    expect(() =>
      createSpecificationScaffold(input({ archetypeId: 'minimal', slug: 'Bad Slug' })),
    ).toThrow(/slug/u);
  });
});

describe('archive preserves archetype and documents', () => {
  it('keeps the registry and unknown keys when only the status changes', () => {
    const scaffold = createSpecificationScaffold(
      input({
        archetypeId: 'feature',
        optionalDocumentIds: ['behaviour', 'ux'],
        folders: ['research'],
      }),
    );
    const parsed = parse(scaffold.files[0]!.content) as Record<string, unknown>;
    const archived = archivedManifestText({ ...parsed, 'x-owner': 'core' });
    const before = manifestOf(scaffold);
    const after = parseSpecificationManifestText(archived, scaffold.slug, 'archive');
    expect(after).toEqual({ ...before, status: 'archived', location: 'archive' });
    expect(archived).toContain('x-owner: core');
  });
});
