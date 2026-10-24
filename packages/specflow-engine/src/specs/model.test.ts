import { stringify } from 'yaml';
import { describe, expect, it } from 'vitest';

import { MANIFEST_MAX_BYTES } from './documents/limits';
import {
  SpecificationError,
  parseSpecificationManifest,
  parseSpecificationManifestText,
} from './model';

const SPEC_ID = '11111111-2222-4333-8444-555555555555';
const SLUG = 'my-spec';

function validSource(): Record<string, unknown> {
  return {
    id: SLUG,
    title: 'My spec',
    status: 'draft',
    priority: 10,
    created: '2026-10-24',
    tasks: [],
    spec_id: SPEC_ID,
    archetype: {
      id: 'feature',
      version: 1,
      requirements: [
        { documentType: 'overview', minCount: 1 },
        { documentType: 'behaviour', minCount: 0 },
      ],
    },
    documents: [
      { id: 'overview', path: 'overview.md', type: 'overview' },
      { id: 'behaviour', path: 'docs/behaviour.md', type: 'behaviour' },
    ],
    folders: ['research'],
  };
}

type Source = ReturnType<typeof validSource>;
const archetypeOf = (source: Source) => source.archetype as Record<string, unknown>;
const documentsOf = (source: Source) => source.documents as Record<string, unknown>[];
const requirementsOf = (source: Source) =>
  archetypeOf(source).requirements as Record<string, unknown>[];

function expectInvalid(source: unknown, fieldFragment: string): void {
  let caught: unknown;
  try {
    parseSpecificationManifest(source, SLUG, 'active');
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(SpecificationError);
  const error = caught as SpecificationError;
  expect(error.code).toBe('SPEC_SOURCE_INVALID');
  expect(error.message).toContain(`"${SLUG}"`);
  expect(error.message).toContain(fieldFragment);
  expect(error.message).not.toMatch(/[A-Za-z]:\\|\/home\/|\/tmp\//u);
}

describe('parseSpecificationManifest', () => {
  it('parses a valid manifest into the model', () => {
    expect(parseSpecificationManifest(validSource(), SLUG, 'active')).toEqual({
      specId: SPEC_ID,
      slug: SLUG,
      title: 'My spec',
      archetype: {
        id: 'feature',
        version: 1,
        requirements: [
          { documentType: 'overview', minCount: 1 },
          { documentType: 'behaviour', minCount: 0 },
        ],
      },
      documents: [
        { id: 'overview', path: 'overview.md', type: 'overview' },
        { id: 'behaviour', path: 'docs/behaviour.md', type: 'behaviour' },
      ],
      folders: ['research'],
      status: 'draft',
      location: 'active',
      priority: 10,
      created: '2026-10-24',
      tasks: [],
    });
  });

  it('defaults absent folders to an empty list and tolerates unknown top-level keys', () => {
    const source: Source = { ...validSource(), custom: { a: 1 }, type: 'legacy' };
    delete source.folders;
    const manifest = parseSpecificationManifest(source, SLUG, 'archive');
    expect(manifest.folders).toEqual([]);
    expect(manifest.location).toBe('archive');
    expect(manifest).not.toHaveProperty('type');
    expect(manifest).not.toHaveProperty('custom');
  });

  it('accepts a retired document type that is not in any catalogue', () => {
    const source = validSource();
    documentsOf(source)[1]!.type = 'retired-type';
    expect(parseSpecificationManifest(source, SLUG, 'active').documents[1]?.type).toBe(
      'retired-type',
    );
  });

  describe('rule 1: the old type field is not read', () => {
    it('rejects the old type-only manifest', () => {
      const old = {
        id: SLUG,
        title: 'My spec',
        type: 'legacy',
        status: 'draft',
        tasks: [],
        spec_id: SPEC_ID,
      };
      expectInvalid(old, 'archetype');
    });

    it('rejects a missing archetype and a missing documents list', () => {
      const noArchetype = validSource();
      delete noArchetype.archetype;
      expectInvalid(noArchetype, 'archetype');
      const noDocuments = validSource();
      delete noDocuments.documents;
      expectInvalid(noDocuments, 'documents');
    });
  });

  describe('base fields', () => {
    it.each([
      ['not an object', 'manifest'],
      [{ ...validSource(), id: 'other' }, 'id'],
      [{ ...validSource(), spec_id: 'nope' }, 'spec_id'],
      [{ ...validSource(), title: ' ' }, 'title'],
      [{ ...validSource(), status: 3 }, 'status'],
      [{ ...validSource(), tasks: {} }, 'tasks'],
      [{ ...validSource(), priority: 'high' }, 'priority'],
      [{ ...validSource(), created: 20261024 }, 'created'],
    ])('rejects %#', (source, field) => {
      expectInvalid(source, field);
    });
  });

  describe('rule 2: unknown keys inside strict objects', () => {
    it('rejects unknown keys in archetype, documents[] and requirements[]', () => {
      const a = validSource();
      archetypeOf(a).extra = 1;
      expectInvalid(a, 'archetype.extra');
      const d = validSource();
      documentsOf(d)[0]!.title = 'x';
      expectInvalid(d, 'documents[0].title');
      const r = validSource();
      requirementsOf(r)[0]!.required = true;
      expectInvalid(r, 'archetype.requirements[0].required');
    });
  });

  describe('rule 3: document ids and types', () => {
    it.each([
      ['Upper', 'documents[1].id'],
      ['u-0123456789abcdef', 'documents[1].id'],
      ['', 'documents[1].id'],
      ['-lead', 'documents[1].id'],
      ['x'.repeat(65), 'documents[1].id'],
    ])('rejects id %j', (id, field) => {
      const source = validSource();
      documentsOf(source)[1]!.id = id;
      expectInvalid(source, field);
    });

    it('rejects a duplicate id', () => {
      const source = validSource();
      documentsOf(source)[1]!.id = 'overview';
      expectInvalid(source, 'documents[1].id');
    });

    it('rejects an invalid type', () => {
      const source = validSource();
      documentsOf(source)[1]!.type = 'Bad Type';
      expectInvalid(source, 'documents[1].type');
    });
  });

  describe('rule 4: paths', () => {
    it.each([
      '../escape.md',
      '/abs.md',
      'a//b.md',
      '.hidden.md',
      'con.md',
      'bad:name.md',
      'specification.yaml',
      'trailing.',
    ])('rejects path %j', (path) => {
      const source = validSource();
      documentsOf(source)[1]!.path = path;
      expectInvalid(source, 'documents[1].path');
    });

    it('rejects a registered file that is also a folder of another registered file', () => {
      const source = validSource();
      documentsOf(source).push({ id: 'dir', path: 'docs', type: 'note' });
      expectInvalid(source, 'is a registered file and also a folder');
    });

    it('rejects paths that are equal ignoring case', () => {
      const source = validSource();
      documentsOf(source)[1]!.path = 'OVERVIEW.md';
      expectInvalid(source, 'documents[].path');
    });
  });

  describe('rule 5: exactly one fixed overview entry (PC-1)', () => {
    it('rejects a missing overview entry', () => {
      const source = validSource();
      source.documents = documentsOf(source).slice(1);
      expectInvalid(source, 'exactly one overview entry');
    });

    it.each([
      ['path', 'main.md'],
      ['type', 'behaviour'],
    ])('rejects an overview entry with another %s', (key, value) => {
      const source = validSource();
      documentsOf(source)[0]![key] = value;
      expectInvalid(source, 'exactly one overview entry');
    });

    it('rejects a second entry of the overview type', () => {
      const source = validSource();
      documentsOf(source)[1]!.type = 'overview';
      expectInvalid(source, 'exactly one overview entry');
    });

    it('rejects another entry that claims the fixed overview path', () => {
      const source = validSource();
      documentsOf(source)[1]!.path = 'Overview.md';
      expectInvalid(source, 'documents');
    });
  });

  describe('rule 6: requirements', () => {
    it('rejects missing, non-array and invalid requirements', () => {
      const missing = validSource();
      delete archetypeOf(missing).requirements;
      expectInvalid(missing, 'archetype.requirements');
      const bad = validSource();
      requirementsOf(bad)[1]!.documentType = 'Bad';
      expectInvalid(bad, 'documentType');
    });

    it.each([-1, 1.5, '1', null])('rejects minCount %j', (minCount) => {
      const source = validSource();
      requirementsOf(source)[1]!.minCount = minCount;
      expectInvalid(source, 'minCount');
    });

    it('rejects a duplicate requirement type', () => {
      const source = validSource();
      requirementsOf(source).push({ documentType: 'behaviour', minCount: 1 });
      expectInvalid(source, 'more than once');
    });

    it('requires overview with minCount of at least 1', () => {
      const without = validSource();
      archetypeOf(without).requirements = [{ documentType: 'behaviour', minCount: 1 }];
      expectInvalid(without, 'overview');
      const zero = validSource();
      requirementsOf(zero)[0]!.minCount = 0;
      expectInvalid(zero, 'overview');
    });

    it.each([0, 1.5, '1'])('rejects archetype version %j', (version) => {
      const source = validSource();
      archetypeOf(source).version = version;
      expectInvalid(source, 'archetype.version');
    });

    it('rejects an invalid archetype id', () => {
      const source = validSource();
      archetypeOf(source).id = 'Feature';
      expectInvalid(source, 'archetype.id');
    });
  });

  describe('rule 7: folders', () => {
    it('rejects invalid, duplicate and file-equal folders', () => {
      const invalid = validSource();
      invalid.folders = ['../x'];
      expectInvalid(invalid, 'folders[0]');
      const duplicate = validSource();
      duplicate.folders = ['research', 'Research'];
      expectInvalid(duplicate, 'folders[1]');
      const equalsFile = validSource();
      equalsFile.folders = ['OVERVIEW.md'];
      expectInvalid(equalsFile, 'folders[0]');
      const belowFile = validSource();
      const deepBelowFile = validSource();
      deepBelowFile.folders = ['overview.md/sub/deeper'];
      expectInvalid(deepBelowFile, 'is below the registered file');
      const fileBelowFolder = validSource();
      fileBelowFolder.folders = ['docs/behaviour.md/x'];
      expectInvalid(fileBelowFolder, 'is below the registered file');
      belowFile.folders = ['overview.md/sub'];
      expectInvalid(belowFile, 'is below the registered file');
      const notArray = validSource();
      notArray.folders = 'research';
      expectInvalid(notArray, 'folders');
    });
  });
});

describe('parseSpecificationManifestText', () => {
  it('parses YAML text', () => {
    expect(parseSpecificationManifestText(stringify(validSource()), SLUG, 'active').slug).toBe(
      SLUG,
    );
  });

  it('rejects invalid YAML and names the slug', () => {
    expect(() => parseSpecificationManifestText('a: [', SLUG, 'active')).toThrow(/my-spec.*YAML/u);
  });

  it('rejects a manifest above the size limit', () => {
    const big = validSource();
    big.padding = 'x'.repeat(MANIFEST_MAX_BYTES);
    expect(() => parseSpecificationManifestText(stringify(big), SLUG, 'active')).toThrow(
      /larger than/u,
    );
  });

  it('measures the limit in bytes, not characters', () => {
    const multibyte = validSource();
    multibyte.padding = 'ż'.repeat(MANIFEST_MAX_BYTES / 2 - 2000);
    const text = stringify(multibyte);
    expect(text.length).toBeLessThan(MANIFEST_MAX_BYTES);
    expect(Buffer.byteLength(text)).toBeGreaterThan(MANIFEST_MAX_BYTES - 8000);
    expect(() => parseSpecificationManifestText(text, SLUG, 'active')).not.toThrow();
    multibyte.padding = 'ż'.repeat(MANIFEST_MAX_BYTES / 2);
    expect(() => parseSpecificationManifestText(stringify(multibyte), SLUG, 'active')).toThrow(
      /larger than/u,
    );
  });
});
