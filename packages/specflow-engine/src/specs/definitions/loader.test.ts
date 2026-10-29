import type { DefinitionProblem } from '@nevo/specflow-contracts/documents';
import { describe, expect, it } from 'vitest';

import { loadDefinitions, normalizeLineEndings, type LoadResult } from './loader';
import { createDefaultDefinitionRegistry } from './kinds';
import {
  DEFINITION_DIRECTORY_ENTRIES_MAX,
  DEFINITION_FILE_MAX_BYTES,
  DEFINITION_LOAD_MAX_BYTES,
} from './limits';
import { resolveProjectCatalogue } from './project-catalogue';
import type { DefinitionSource } from './source';
import {
  OVERVIEW_TEMPLATE_TEXT,
  archetypeFile,
  documentTypeFile,
  overviewTemplate,
  sampleProject,
  toYaml,
  MemoryDefinitionSource,
} from './test-support';

const registry = createDefaultDefinitionRegistry();

function load(source: DefinitionSource): Promise<LoadResult> {
  return loadDefinitions(source, registry);
}

function codes(result: LoadResult): string[] {
  return result.problems.map((problem) => `${problem.source}:${problem.code}`);
}

function problemOf(result: LoadResult, source: string): DefinitionProblem {
  const problem = result.problems.find((item) => item.source === source);
  if (!problem) {
    throw new Error(`No problem for ${source}: ${JSON.stringify(codes(result))}`);
  }

  return problem;
}

describe('loadDefinitions', () => {
  it('records, per definition, the files whose state decides it', async () => {
    const source = sampleProject();
    source.set('document-type/ghost.yaml', 'x: [');
    source.set(
      'specification-archetype/broken.yaml',
      archetypeFile('broken', { requirements: [{ documentType: 'ghost', minCount: 1 }] }),
    );
    const result = await load(source);
    expect(result.dependencies.get('specification-archetype/minimal')).toEqual([
      'specification-archetype/minimal.yaml',
      'specification-archetype/templates/overview.md',
      'document-type/note.yaml',
      'document-type/overview.yaml',
    ]);
    // A definition rejected by a cross-reference check still names what it depends on.
    expect(result.dependencies.get('specification-archetype/broken')).toContain(
      'document-type/ghost.yaml',
    );
    // A file rejected before it was parsed depends on itself only.
    expect(result.dependencies.get('document-type/ghost')).toEqual(['document-type/ghost.yaml']);
  });

  it('loads a valid project and normalises template files to LF', async () => {
    const result = await load(sampleProject());
    expect(result.problems).toEqual([]);
    expect(result.rootPresent).toBe(true);
    expect([...(result.definitions.get('document-type')?.keys() ?? [])]).toEqual([
      'note',
      'overview',
    ]);
    const catalogue = resolveProjectCatalogue(result).catalogue;
    expect(catalogue.findTemplate('minimal', 'overview')?.content).toBe(
      normalizeLineEndings(OVERVIEW_TEMPLATE_TEXT),
    );
    expect(catalogue.findTemplate('minimal', 'overview')?.content).not.toContain('\r');
  });

  it('carries an optional document type icon into the catalogue, checking only its shape', async () => {
    const source = sampleProject();
    source.set('document-type/overview.yaml', documentTypeFile('overview', { icon: 'info' }));
    // Not a Design System icon today: still valid (the UI falls back), the Engine owns no registry.
    source.set('document-type/note.yaml', documentTypeFile('note', { icon: 'some-future-icon' }));
    const result = await load(source);
    expect(result.problems).toEqual([]);
    const types = resolveProjectCatalogue(result).catalogue.documentTypes;
    expect(types.find((type) => type.id === 'overview')?.icon).toBe('info');
    expect(types.find((type) => type.id === 'note')?.icon).toBe('some-future-icon');

    // Without the field nothing changes; a malformed name rejects the file.
    const plain = await load(sampleProject());
    expect(
      resolveProjectCatalogue(plain).catalogue.documentTypes.every((type) => !('icon' in type)),
    ).toBe(true);
    for (const icon of ['', 'Info', 'file_text', 'a'.repeat(65), 7]) {
      const bad = sampleProject();
      bad.set('document-type/note.yaml', documentTypeFile('note', { icon }));
      expect(problemOf(await load(bad), 'document-type/note.yaml').code).toBe('schema-invalid');
    }
  });

  it('reports nothing for a tree that does not exist', async () => {
    const result = await load(new MemoryDefinitionSource());
    expect(result).toMatchObject({ rootPresent: false, problems: [] });
  });

  it('gives the same catalogue and revision whatever the order the files were created in', async () => {
    const files = {
      'document-type/overview.yaml': documentTypeFile('overview'),
      'document-type/note.yaml': documentTypeFile('note'),
      'specification-archetype/minimal.yaml': archetypeFile('minimal'),
      'specification-archetype/templates/overview.md': OVERVIEW_TEMPLATE_TEXT,
    };
    const reversed = Object.fromEntries(Object.entries(files).reverse());
    const a = resolveProjectCatalogue(await load(new MemoryDefinitionSource(files)));
    const b = resolveProjectCatalogue(await load(new MemoryDefinitionSource(reversed)));
    expect(a.catalogue.revision).toBe(b.catalogue.revision);
    expect(a.catalogue.revision).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('does not let CRLF in a template file change the revision', async () => {
    const lf = sampleProject();
    lf.set(
      'specification-archetype/templates/overview.md',
      normalizeLineEndings(OVERVIEW_TEMPLATE_TEXT),
    );
    const crlf = sampleProject();
    expect(resolveProjectCatalogue(await load(lf)).catalogue.revision).toBe(
      resolveProjectCatalogue(await load(crlf)).catalogue.revision,
    );
  });

  describe('file level problems isolate the file', () => {
    async function withBadFile(path: string, content: string | Uint8Array) {
      const source = sampleProject();
      source.set(path, content);
      const result = await load(source);
      // The rest of the project still loads.
      expect(result.definitions.get('document-type')?.has('overview')).toBe(true);
      expect(result.definitions.get('specification-archetype')?.has('minimal')).toBe(true);

      return result;
    }

    it('rejects YAML that does not parse', async () => {
      const result = await withBadFile('document-type/broken.yaml', 'id: [unclosed');
      expect(problemOf(result, 'document-type/broken.yaml')).toMatchObject({
        code: 'yaml-invalid',
        severity: 'error',
        kind: 'document-type',
      });
      expect(result.invalid.get('document-type')?.has('broken')).toBe(true);
    });

    it.each([
      ['an alias', 'a: &x 1\nb: *x\n'],
      ['a merge key', 'base: &b {a: 1}\nmerged:\n  <<: *b\n'],
      ['a merge key without an alias', 'merged:\n  <<: {a: 1}\n'],
      ['a duplicate key', 'a: 1\na: 2\n'],
      ['two documents', 'a: 1\n---\nb: 2\n'],
      ['a binary tag', 'a: !!binary aGVsbG8=\n'],
    ])('rejects %s', async (_name, yaml) => {
      const result = await withBadFile('document-type/odd.yaml', yaml);
      expect(problemOf(result, 'document-type/odd.yaml').code).toBe('yaml-invalid');
    });

    it('rejects a billion-laughs file without expanding it', async () => {
      const lines = ['a: &a [x, x, x, x, x, x, x, x, x]'];
      for (const [name, previous] of [
        ['b', 'a'],
        ['c', 'b'],
        ['d', 'c'],
        ['e', 'd'],
        ['f', 'e'],
        ['g', 'f'],
        ['h', 'g'],
        ['i', 'h'],
      ] as const) {
        lines.push(`${name}: &${name} [*${previous}, *${previous}, *${previous}, *${previous}]`);
      }

      const result = await withBadFile('document-type/bomb.yaml', `${lines.join('\n')}\n`);
      expect(problemOf(result, 'document-type/bomb.yaml').code).toBe('yaml-invalid');
    });

    it('rejects a deeply nested file instead of overflowing the stack', async () => {
      const result = await withBadFile(
        'document-type/deep.yaml',
        `a: ${'['.repeat(20000)}${']'.repeat(20000)}\n`,
      );
      expect(problemOf(result, 'document-type/deep.yaml').code).toBe('yaml-invalid');
    });

    it('rejects text that is not UTF-8 and text with a NUL', async () => {
      const bad = await withBadFile('document-type/latin.yaml', new Uint8Array([0x61, 0x3a, 0xe9]));
      expect(problemOf(bad, 'document-type/latin.yaml').code).toBe('yaml-invalid');
      const nul = await withBadFile('document-type/nulchar.yaml', 'a: b\u0000\n');
      expect(problemOf(nul, 'document-type/nulchar.yaml').code).toBe('yaml-invalid');
    });

    it('rejects a file above the size limit without reading it', async () => {
      const source = sampleProject();
      source.set('document-type/big.yaml', 'x'.repeat(DEFINITION_FILE_MAX_BYTES + 1));
      const reads = source.calls.read;
      const result = await load(source);
      expect(problemOf(result, 'document-type/big.yaml').code).toBe('file-too-large');
      // sampleProject has 4 files; the big one was never opened.
      expect(source.calls.read - reads).toBe(4);
    });

    it('rejects a scalar or a list at the top level', async () => {
      const result = await withBadFile('document-type/list.yaml', '- a\n- b\n');
      expect(problemOf(result, 'document-type/list.yaml').code).toBe('schema-invalid');
    });

    it('rejects an unknown key, a missing field and a wrong id pattern', async () => {
      const source = sampleProject();
      source.set('document-type/extra.yaml', documentTypeFile('extra', { origin: 'builtin' }));
      source.set('document-type/gap.yaml', documentTypeFile('gap', { instructions: undefined }));
      source.set('document-type/upper.yaml', documentTypeFile('upper', { id: 'Upper' }));
      const result = await load(source);
      expect(codes(result)).toEqual([
        'document-type/extra.yaml:schema-invalid',
        'document-type/gap.yaml:schema-invalid',
        'document-type/upper.yaml:schema-invalid',
      ]);
      expect(problemOf(result, 'document-type/gap.yaml').location).toBeDefined();
    });

    it('rejects a template with both content and contentFile, or neither', async () => {
      const both = overviewTemplate({ content: 'x' });
      const neither = { ...overviewTemplate(), contentFile: undefined };
      const source = sampleProject();
      source.set('specification-archetype/both.yaml', archetypeFile('both', { templates: [both] }));
      source.set(
        'specification-archetype/neither.yaml',
        archetypeFile('neither', { templates: [neither] }),
      );
      const result = await load(source);
      expect(problemOf(result, 'specification-archetype/both.yaml').code).toBe('schema-invalid');
      expect(problemOf(result, 'specification-archetype/neither.yaml').code).toBe('schema-invalid');
    });

    it('rejects preselected on an always template and an id over 32 characters', async () => {
      const source = sampleProject();
      source.set(
        'specification-archetype/pre.yaml',
        archetypeFile('pre', { templates: [overviewTemplate({ preselected: true })] }),
      );
      const longId = `a${'b'.repeat(32)}`;
      source.set(`document-type/${longId}.yaml`, documentTypeFile(longId));
      const result = await load(source);
      expect(problemOf(result, 'specification-archetype/pre.yaml').code).toBe('schema-invalid');
      expect(problemOf(result, `document-type/${longId}.yaml`).code).toBe('unexpected-entry');
    });

    it('rejects a kind that does not match the folder and an id that does not match the file name', async () => {
      const source = sampleProject();
      source.set('document-type/wrong.yaml', archetypeFile('wrong'));
      source.set('document-type/other.yaml', documentTypeFile('another'));
      const result = await load(source);
      expect(problemOf(result, 'document-type/wrong.yaml')).toMatchObject({
        code: 'kind-mismatch',
        location: '/kind',
      });
      expect(problemOf(result, 'document-type/other.yaml')).toMatchObject({
        code: 'id-filename-mismatch',
        location: '/id',
      });
    });

    it('rejects a schema version the kind does not support', async () => {
      const source = sampleProject();
      source.set('document-type/future.yaml', documentTypeFile('future', { schemaVersion: 2 }));
      const result = await load(source);
      expect(problemOf(result, 'document-type/future.yaml').code).toBe(
        'unsupported-schema-version',
      );
    });

    it('rejects text above the exact byte limit that still fits the character limit', async () => {
      const source = sampleProject();
      source.set('document-type/wide.yaml', documentTypeFile('wide', { useWhen: 'ż'.repeat(600) }));
      const result = await load(source);
      expect(problemOf(result, 'document-type/wide.yaml')).toMatchObject({
        code: 'schema-invalid',
        location: '/useWhen',
      });
    });

    it('rejects an invalid default filename and a reserved id space', async () => {
      const source = sampleProject();
      source.set(
        'document-type/path.yaml',
        documentTypeFile('path', { defaultFilename: '../x.md' }),
      );
      source.set('document-type/u-mine.yaml', documentTypeFile('u-mine'));
      const result = await load(source);
      expect(problemOf(result, 'document-type/path.yaml').location).toBe('/defaultFilename');
      expect(problemOf(result, 'document-type/u-mine.yaml').location).toBe('/id');
    });
  });

  describe('entries that are not definitions', () => {
    it('reports unexpected entries and device names as warnings and ignores them', async () => {
      const source = sampleProject();
      source.set('document-type/README.md', 'notes');
      source.set('document-type/Upper.yaml', documentTypeFile('upper'));
      source.set('document-type/con.yaml', documentTypeFile('con'));
      source.set('document-type/lpt1.yaml', documentTypeFile('lpt1'));
      source.set('document-type/nested/inner.yaml', documentTypeFile('inner'));
      source.set('README.md', 'x');
      source.set('task-archetype/x.yaml', 'x');
      const result = await load(source);
      expect(result.problems.map((p) => [p.source, p.code, p.severity])).toEqual([
        ['README.md', 'unexpected-entry', 'warning'],
        ['document-type/README.md', 'unexpected-entry', 'warning'],
        ['document-type/Upper.yaml', 'unexpected-entry', 'warning'],
        ['document-type/con.yaml', 'unexpected-entry', 'warning'],
        ['document-type/lpt1.yaml', 'unexpected-entry', 'warning'],
        ['document-type/nested', 'unexpected-entry', 'warning'],
        ['task-archetype', 'unknown-kind-directory', 'warning'],
      ]);
      expect([...(result.definitions.get('document-type')?.keys() ?? [])]).toEqual([
        'note',
        'overview',
      ]);
    });

    it('does not report the template folder of the archetype kind', async () => {
      expect((await load(sampleProject())).problems).toEqual([]);
    });

    it('does not read a symlink or a special file and reports it as unsafe', async () => {
      const source = sampleProject();
      source.setSymlink('document-type/linked.yaml');
      source.setSpecial('document-type/fifo.yaml');
      source.setSymlink('stray');
      const result = await load(source);
      expect(codes(result)).toEqual([
        'document-type/fifo.yaml:directory-unsafe',
        'document-type/linked.yaml:directory-unsafe',
        'stray:directory-unsafe',
      ]);
      expect(problemOf(result, 'document-type/linked.yaml').severity).toBe('error');
      // A link that carries a definition name is a definition that exists and is rejected.
      expect([...(result.invalid.get('document-type') ?? [])].sort()).toEqual(['fifo', 'linked']);
      expect(result.dependencies.get('document-type/linked')).toEqual([
        'document-type/linked.yaml',
      ]);
    });

    it('rejects a template whose name differs only in case from the listed file', async () => {
      // A case-insensitive filesystem opens "Overview.md" for "overview.md"; the listed name decides.
      const base = sampleProject();
      base.set(
        'specification-archetype/minimal.yaml',
        archetypeFile('minimal', {
          templates: [
            overviewTemplate({ contentFile: 'templates/Overview.md' }),
            {
              id: 'note',
              documentType: 'note',
              filename: 'note.md',
              include: 'optional',
              content: 'n',
            },
          ],
        }),
      );
      const caseInsensitive: DefinitionSource = {
        list: (directory, max) => base.list(directory, max),
        stat: (path) => base.stat(path),
        read: (path, max) => base.read(path.toLowerCase(), max),
      };
      const result = await load(caseInsensitive);
      const problem = problemOf(result, 'specification-archetype/minimal.yaml');
      expect(problem.code).toBe('template-file-invalid');
      expect(problem.message).toContain('case-sensitive');
    });

    it('rejects a kind folder or a definitions root that is not a plain directory', async () => {
      const kindLinked = sampleProject();
      kindLinked.setUnsafeDirectory('document-type');
      const kindResult = await load(kindLinked);
      expect(problemOf(kindResult, 'document-type').code).toBe('directory-unsafe');
      // Every archetype now references a document type that does not load.
      expect(kindResult.definitions.get('specification-archetype')?.size).toBe(0);

      const rootLinked = sampleProject();
      rootLinked.setUnsafeDirectory('');
      expect(codes(await load(rootLinked))).toEqual([':directory-unsafe']);
    });
  });

  describe('template files', () => {
    async function withTemplate(prepare: (source: MemoryDefinitionSource) => void) {
      const source = sampleProject();
      prepare(source);

      return load(source);
    }

    it('reports a missing template file and invalidates only that archetype', async () => {
      const result = await withTemplate((s) =>
        s.delete('specification-archetype/templates/overview.md'),
      );
      expect(problemOf(result, 'specification-archetype/minimal.yaml')).toMatchObject({
        code: 'template-file-invalid',
        location: '/templates/0/contentFile',
      });
      expect(result.definitions.get('document-type')?.size).toBe(2);
    });

    it('reports a symlinked template file or folder', async () => {
      const file = await withTemplate((s) =>
        s.setSymlink('specification-archetype/templates/overview.md'),
      );
      expect(problemOf(file, 'specification-archetype/minimal.yaml').code).toBe(
        'template-file-invalid',
      );
      const folder = await withTemplate((s) =>
        s.setUnsafeDirectory('specification-archetype/templates'),
      );
      expect(problemOf(folder, 'specification-archetype/minimal.yaml').code).toBe(
        'template-file-invalid',
      );
    });

    it.each([
      '../x.md',
      'templates/../x.md',
      '/etc/passwd',
      'templates/a b.md',
      'templates\\x.md',
      'other/x.md',
    ])('rejects the template path %s by the schema', async (path) => {
      const source = sampleProject();
      source.set(
        'specification-archetype/bad.yaml',
        archetypeFile('bad', { templates: [overviewTemplate({ contentFile: path })] }),
      );
      const result = await load(source);
      expect(problemOf(result, 'specification-archetype/bad.yaml').code).toBe('schema-invalid');
    });

    it('rejects a template file above the limit, with a NUL or not UTF-8', async () => {
      const big = await withTemplate((s) =>
        s.set('specification-archetype/templates/overview.md', 'x'.repeat(64 * 1024 + 1)),
      );
      expect(problemOf(big, 'specification-archetype/minimal.yaml').code).toBe(
        'template-file-invalid',
      );
      const nul = await withTemplate((s) =>
        s.set('specification-archetype/templates/overview.md', 'a\u0000'),
      );
      expect(problemOf(nul, 'specification-archetype/minimal.yaml').code).toBe(
        'template-file-invalid',
      );
      const latin = await withTemplate((s) =>
        s.set('specification-archetype/templates/overview.md', new Uint8Array([0xe9])),
      );
      expect(problemOf(latin, 'specification-archetype/minimal.yaml').code).toBe(
        'template-file-invalid',
      );
    });

    it('accepts a template file in a nested folder', async () => {
      const source = sampleProject();
      source.set(
        'specification-archetype/templates/deep/er/overview.md',
        '# {{specificationTitle}}\n',
      );
      source.set(
        'specification-archetype/nested.yaml',
        archetypeFile('nested', {
          templates: [overviewTemplate({ contentFile: 'templates/deep/er/overview.md' })],
        }),
      );
      expect((await load(source)).problems).toEqual([]);
    });
  });

  describe('cross-references cascade by reference', () => {
    it('invalidates an archetype whose required document type is missing', async () => {
      const source = sampleProject();
      source.delete('document-type/note.yaml');
      const result = await load(source);
      expect(result.problems).toMatchObject([
        {
          source: 'specification-archetype/minimal.yaml',
          code: 'reference-missing',
          location: '/templates/1/documentType',
        },
      ]);
      expect(result.definitions.get('specification-archetype')?.size).toBe(0);
      expect(result.invalid.get('specification-archetype')?.has('minimal')).toBe(true);
    });

    it('reports reference-invalid when the document type file exists but was rejected', async () => {
      const source = sampleProject();
      source.set('document-type/note.yaml', 'not: [valid');
      const result = await load(source);
      expect(codes(result)).toEqual([
        'document-type/note.yaml:yaml-invalid',
        'specification-archetype/minimal.yaml:reference-invalid',
      ]);
    });

    it('keeps the other archetypes when one is invalid', async () => {
      const source = sampleProject();
      source.set(
        'specification-archetype/ghosty.yaml',
        archetypeFile('ghosty', {
          requirements: [
            { documentType: 'overview', minCount: 1 },
            { documentType: 'ghost', minCount: 1 },
          ],
        }),
      );
      const result = await load(source);
      expect(codes(result)).toEqual(['specification-archetype/ghosty.yaml:reference-missing']);
      expect([...(result.definitions.get('specification-archetype')?.keys() ?? [])]).toEqual([
        'minimal',
      ]);
    });

    it('invalidates every archetype when the overview document type is missing', async () => {
      const source = sampleProject();
      source.set('specification-archetype/second.yaml', archetypeFile('second'));
      source.delete('document-type/overview.yaml');
      const result = await load(source);
      expect(result.definitions.get('specification-archetype')?.size).toBe(0);
      expect([...new Set(codes(result))]).toEqual([
        'specification-archetype/minimal.yaml:reference-missing',
        'specification-archetype/second.yaml:reference-missing',
      ]);
    });

    it('requires the overview requirement and exactly one valid overview template', async () => {
      const source = sampleProject();
      source.set(
        'specification-archetype/norequirement.yaml',
        archetypeFile('norequirement', { requirements: [] }),
      );
      source.set(
        'specification-archetype/zero.yaml',
        archetypeFile('zero', { requirements: [{ documentType: 'overview', minCount: 0 }] }),
      );
      source.set(
        'specification-archetype/notemplate.yaml',
        archetypeFile('notemplate', { templates: [] }),
      );
      source.set(
        'specification-archetype/renamed.yaml',
        archetypeFile('renamed', { templates: [overviewTemplate({ filename: 'main.md' })] }),
      );
      source.set(
        'specification-archetype/optional.yaml',
        archetypeFile('optional', {
          templates: [
            { ...overviewTemplate(), include: 'optional', contentFile: 'templates/overview.md' },
          ],
        }),
      );
      const result = await load(source);
      expect(problemOf(result, 'specification-archetype/norequirement.yaml').code).toBe(
        'requirement-overview-missing',
      );
      expect(problemOf(result, 'specification-archetype/zero.yaml').code).toBe(
        'requirement-overview-missing',
      );
      for (const id of ['notemplate', 'renamed', 'optional']) {
        expect(problemOf(result, `specification-archetype/${id}.yaml`).code).toBe(
          'overview-template-invalid',
        );
      }
    });

    it('rejects duplicate template ids, duplicate requirements, u- ids and filename clashes', async () => {
      const note = (id: string, filename: string) => ({
        id,
        documentType: 'note',
        filename,
        include: 'optional',
        content: 'x',
      });
      const source = sampleProject();
      source.set(
        'specification-archetype/dup.yaml',
        archetypeFile('dup', {
          templates: [overviewTemplate(), note('n', 'a.md'), note('n', 'b.md')],
        }),
      );
      source.set(
        'specification-archetype/case.yaml',
        archetypeFile('case', { templates: [overviewTemplate(), note('n', 'Overview.MD')] }),
      );
      source.set(
        'specification-archetype/reserved.yaml',
        archetypeFile('reserved', { templates: [overviewTemplate(), note('u-x', 'x.md')] }),
      );
      source.set(
        'specification-archetype/twice.yaml',
        archetypeFile('twice', {
          requirements: [
            { documentType: 'overview', minCount: 1 },
            { documentType: 'overview', minCount: 2 },
          ],
        }),
      );
      const result = await load(source);
      for (const id of ['dup', 'case', 'reserved', 'twice']) {
        expect(problemOf(result, `specification-archetype/${id}.yaml`).code).toBe('schema-invalid');
      }
    });
  });

  describe('limits', () => {
    it('rejects the files past the entry limit in name order and never reads them', async () => {
      const source = sampleProject();
      const names: string[] = [];
      for (let index = 0; index < DEFINITION_DIRECTORY_ENTRIES_MAX; index += 1) {
        const id = `t${String(index).padStart(3, '0')}`;
        names.push(id);
        source.set(`document-type/${id}.yaml`, documentTypeFile(id));
      }

      const result = await load(source);
      // note, overview and 498 numbered files fit; the last numbered ones are over the entry limit.
      const limited = result.problems
        .filter((p) => p.code === 'limit-exceeded')
        .map((p) => p.source);
      expect(limited.length).toBeGreaterThan(0);
      expect(limited).toEqual([...limited].sort());
      expect(limited).toContain('document-type/t499.yaml');
      expect(limited).not.toContain('document-type/note.yaml');
    });

    it('loads at most the entity limit of a kind', async () => {
      const source = new MemoryDefinitionSource();
      for (let index = 0; index < 105; index += 1) {
        const id = `t${String(index).padStart(3, '0')}`;
        source.set(`document-type/${id}.yaml`, documentTypeFile(id));
      }

      const result = await load(source);
      expect(result.definitions.get('document-type')?.size).toBe(100);
      expect(result.problems.filter((p) => p.code === 'limit-exceeded')).toHaveLength(5);
    });

    it('rejects the files past the total byte budget', async () => {
      const source = new MemoryDefinitionSource();
      const filler = 'x'.repeat(100 * 1024);
      const count = Math.ceil(DEFINITION_LOAD_MAX_BYTES / (100 * 1024)) + 2;
      for (let index = 0; index < count; index += 1) {
        const id = `t${String(index).padStart(3, '0')}`;
        source.set(
          `document-type/${id}.yaml`,
          documentTypeFile(id, { instructions: 'ok' }) + `# ${filler}\n`,
        );
      }

      const result = await load(source);
      expect(result.problems.some((p) => p.code === 'limit-exceeded')).toBe(true);
      expect(result.bytesRead).toBeLessThanOrEqual(DEFINITION_LOAD_MAX_BYTES);
    });

    it('rejects a whole directory that overflows the listing bound', async () => {
      const source = new MemoryDefinitionSource({
        'document-type/overview.yaml': documentTypeFile('overview'),
      });
      const overflowing: DefinitionSource = {
        ...source,
        list: (directory, max) =>
          directory === 'document-type'
            ? Promise.resolve({ state: 'overflow' })
            : source.list(directory, max),
        read: (path, max) => source.read(path, max),
        stat: (path) => source.stat(path),
      };
      const result = await load(overflowing);
      expect(problemOf(result, 'document-type')).toMatchObject({ code: 'directory-unsafe' });
    });
  });

  it('reports a duplicated id once and rejects both entries', async () => {
    const base = sampleProject();
    const duplicating: DefinitionSource = {
      list: async (directory, max) => {
        const listing = await base.list(directory, max);
        if (directory !== 'document-type' || listing.state !== 'ok') {
          return listing;
        }

        const twin = listing.entries.find((entry) => entry.name === 'note.yaml');

        return twin ? { state: 'ok', entries: [...listing.entries, twin] } : listing;
      },
      read: (path, max) => base.read(path, max),
      stat: (path) => base.stat(path),
    };
    const result = await load(duplicating);
    expect(problemOf(result, 'document-type/note.yaml').code).toBe('id-duplicate');
    expect(result.definitions.get('document-type')?.has('note')).toBe(false);
  });

  it('orders problems errors first, then by source', async () => {
    const source = sampleProject();
    source.set('zzz.txt', 'x');
    source.set('document-type/b.yaml', 'x: [');
    source.set('document-type/a.yaml', 'x: [');
    const result = await load(source);
    expect(result.problems.map((p) => [p.severity, p.source])).toEqual([
      ['error', 'document-type/a.yaml'],
      ['error', 'document-type/b.yaml'],
      ['warning', 'zzz.txt'],
    ]);
  });

  it('never puts an absolute path in a message', async () => {
    const source = sampleProject();
    source.set('document-type/bad.yaml', 'a: [');
    source.set('document-type/ugly.yaml', toYaml({ kind: 'document-type' }));
    const result = await load(source);
    for (const problem of result.problems) {
      expect(problem.message).not.toMatch(/[A-Za-z]:\\|\/Users\/|\/home\//u);
      expect(problem.message.length).toBeLessThanOrEqual(300);
    }
  });
});
