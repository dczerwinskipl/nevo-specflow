import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  ArchetypeDefinitionFileSchema,
  type ArchetypeDefinitionFile,
} from '@nevo/specflow-contracts/documents';
import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import goldenFixtures from './fixtures/overview-golden.json';
import { BUILT_IN_DEFINITIONS, templateSkeleton } from './builtins';
import {
  CatalogueDefinitionError,
  catalogueRevision,
  findCatalogueIssues,
  getBuiltInCatalogue,
  resolveCatalogue,
} from './catalogue';
import {
  GOAL_PROMPT_FALLBACK,
  TEMPLATE_PLACEHOLDERS,
  renderTemplate,
  templateValues,
} from './template-renderer';

const catalogue = getBuiltInCatalogue();

function clone(): ArchetypeDefinitionFile {
  return structuredClone<ArchetypeDefinitionFile>(BUILT_IN_DEFINITIONS);
}

describe('built-in catalogue invariants', () => {
  it('conforms to the definition schema and byte limits', () => {
    expect([...Value.Errors(ArchetypeDefinitionFileSchema, BUILT_IN_DEFINITIONS)]).toEqual([]);
    expect(findCatalogueIssues(BUILT_IN_DEFINITIONS)).toEqual([]);
  });

  it('contains the three archetypes and nine document types', () => {
    expect(catalogue.archetypes.map((a) => [a.id, a.version])).toEqual([
      ['minimal', 1],
      ['feature', 1],
      ['architecture', 1],
    ]);
    expect(catalogue.documentTypes.map((t) => t.id)).toEqual([
      'overview',
      'behaviour',
      'ux',
      'backend',
      'architecture',
      'decisions',
      'research',
      'user-story',
      'note',
    ]);
  });

  it('requires only overview in every archetype and scaffolds an always overview', () => {
    for (const archetype of catalogue.archetypes) {
      expect(archetype.requirements).toEqual([{ documentType: 'overview', minCount: 1 }]);
      const always = archetype.templates.filter((t) => t.include === 'always');
      expect(always).toHaveLength(1);
      expect(always[0]).toMatchObject({
        id: 'overview',
        documentType: 'overview',
        filename: 'overview.md',
      });
      expect(archetype.templates[0]?.id).toBe('overview');
    }
  });

  it('references only existing document types and has unique ids', () => {
    const typeIds = new Set(catalogue.documentTypes.map((t) => t.id));
    expect(typeIds.size).toBe(catalogue.documentTypes.length);
    expect(new Set(catalogue.archetypes.map((a) => a.id)).size).toBe(catalogue.archetypes.length);
    for (const archetype of catalogue.archetypes) {
      expect(new Set(archetype.templates.map((t) => t.id)).size).toBe(archetype.templates.length);
      for (const requirement of archetype.requirements) {
        expect(typeIds.has(requirement.documentType)).toBe(true);
      }
      for (const template of archetype.templates) {
        expect(typeIds.has(template.documentType)).toBe(true);
      }
    }
  });

  it('gives every document type non-empty instructions, description and useWhen', () => {
    for (const type of catalogue.documentTypes) {
      expect(type.instructions.trim()).not.toBe('');
      expect(type.description.trim()).not.toBe('');
      expect(type.useWhen.trim()).not.toBe('');
    }
    for (const archetype of catalogue.archetypes) {
      expect(archetype.description.trim()).not.toBe('');
      expect(archetype.useWhen.trim()).not.toBe('');
    }
  });

  it('is immutable', () => {
    expect(Object.isFrozen(catalogue.archetypes)).toBe(true);
    expect(Object.isFrozen(catalogue.archetypes[0]?.templates[0])).toBe(true);
  });

  it('offers lookups', () => {
    expect(catalogue.findArchetype('feature')?.title).toBe('Feature');
    expect(catalogue.findArchetype('nope')).toBeUndefined();
    expect(catalogue.findDocumentType('ux')?.defaultFilename).toBe('ux.md');
    expect(catalogue.findTemplate('feature', 'backend')?.documentType).toBe('backend');
    expect(catalogue.findTemplate('minimal', 'backend')).toBeUndefined();
  });
});

describe('catalogueRevision', () => {
  it('is a stable sha256 of the resolved catalogue', () => {
    expect(catalogueRevision()).toMatch(/^[0-9a-f]{64}$/u);
    expect(catalogueRevision()).toBe(catalogueRevision());
    expect(resolveCatalogue(clone()).revision).toBe(catalogueRevision());
  });

  it('is independent of object key order', () => {
    const reordered = JSON.parse(
      JSON.stringify(BUILT_IN_DEFINITIONS, (_key, value: unknown) =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(Object.entries(value).reverse())
          : value,
      ),
    ) as ArchetypeDefinitionFile;
    expect(resolveCatalogue(reordered).revision).toBe(catalogueRevision());
  });

  it.each([
    [
      'a document type title',
      (f: ArchetypeDefinitionFile) => void (f.documentTypes![1]!.title = 'Behaviours'),
    ],
    [
      'an instruction',
      (f: ArchetypeDefinitionFile) => void (f.documentTypes![0]!.instructions += ' '),
    ],
    ['an archetype version', (f: ArchetypeDefinitionFile) => void (f.archetypes![0]!.version = 2)],
    [
      'template content',
      (f: ArchetypeDefinitionFile) => void (f.archetypes![1]!.templates[1]!.content += 'x'),
    ],
    [
      'a requirement',
      (f: ArchetypeDefinitionFile) =>
        void f.archetypes![2]!.requirements.push({ documentType: 'decisions', minCount: 1 }),
    ],
    [
      'the template order',
      (f: ArchetypeDefinitionFile) => void f.archetypes![0]!.templates.reverse(),
    ],
  ])('changes when %s changes', (_name, edit) => {
    const edited = clone();
    edit(edited);
    expect(resolveCatalogue(edited).revision).not.toBe(catalogueRevision());
  });
});

describe('catalogue-wide checks the schema cannot express', () => {
  function issuesOf(edit: (file: ArchetypeDefinitionFile) => void): string[] {
    const file = clone();
    edit(file);
    return findCatalogueIssues(file);
  }

  it('rejects a requirement of an unknown document type', () => {
    expect(
      issuesOf((f) => f.archetypes![0]!.requirements.push({ documentType: 'ghost', minCount: 1 })),
    ).toEqual([expect.stringContaining('unknown document type "ghost"')]);
  });

  it('rejects a template of an unknown document type', () => {
    expect(
      issuesOf((f) => {
        f.archetypes![0]!.templates[1]!.documentType = 'ghost';
      }),
    ).toEqual([expect.stringContaining('unknown document type "ghost"')]);
  });

  it('rejects duplicate document type ids, archetype ids and template ids', () => {
    expect(issuesOf((f) => void f.documentTypes!.push({ ...f.documentTypes![0]! }))).toEqual([
      expect.stringContaining('duplicate document type id "overview"'),
    ]);
    expect(issuesOf((f) => void f.archetypes!.push({ ...f.archetypes![0]!, version: 2 }))).toEqual([
      expect.stringContaining('duplicate archetype id "minimal"'),
    ]);
    expect(
      issuesOf((f) => {
        f.archetypes![0]!.templates[2]!.id = 'decisions';
      }),
    ).toEqual(
      expect.arrayContaining([expect.stringContaining('duplicate template id "decisions"')]),
    );
  });

  it('rejects duplicate requirement document types per archetype', () => {
    expect(
      issuesOf((f) =>
        f.archetypes![0]!.requirements.push({ documentType: 'overview', minCount: 2 }),
      ),
    ).toEqual([expect.stringContaining('more than once')]);
  });

  it('rejects template ids that start with u-', () => {
    expect(
      issuesOf((f) => {
        f.archetypes![0]!.templates[1]!.id = 'u-note';
      }),
    ).toEqual([expect.stringContaining('reserved "u-" space')]);
  });

  it('rejects document types in the reserved u- space', () => {
    expect(
      issuesOf((f) =>
        f.documentTypes!.push({ ...f.documentTypes![8]!, id: 'u-extra', defaultFilename: 'e.md' }),
      ),
    ).toEqual([expect.stringContaining('reserved "u-" space')]);
  });

  it.each([
    ['id', (t: { id: string }) => void (t.id = 'not-overview')],
    ['documentType', (t: { documentType: string }) => void (t.documentType = 'note')],
    ['filename', (t: { filename: string }) => void (t.filename = 'main.md')],
  ])('requires the overview template to keep its fixed %s', (_name, edit) => {
    const file = clone();
    edit(file.archetypes![0]!.templates[0]!);
    expect(findCatalogueIssues(file)).not.toEqual([]);
  });

  it('rejects an invalid template filename and case-insensitive filename clashes', () => {
    expect(
      issuesOf((f) => {
        f.archetypes![0]!.templates[1]!.filename = '../x.md';
      }),
    ).toEqual([expect.stringContaining('invalid filename')]);
    expect(
      issuesOf((f) => {
        f.archetypes![0]!.templates[1]!.filename = 'Overview.MD';
      }),
    ).toEqual([expect.stringContaining('same filename ignoring case')]);
  });

  it('rejects text above the exact UTF-8 byte limit that fits the character limit', () => {
    const issues = issuesOf((f) => {
      f.documentTypes![0]!.useWhen = 'ż'.repeat(600); // 600 characters, 1200 bytes
    });
    expect(issues).toEqual([expect.stringContaining('above the 1000 byte limit')]);
  });

  it('rejects schema violations before running the cross-checks', () => {
    const file = clone();
    delete (file.documentTypes![0] as { instructions?: string }).instructions;
    expect(findCatalogueIssues(file)[0]).toMatch(/^schema /u);
  });

  it('rejects a missing overview document type', () => {
    expect(
      issuesOf((f) => {
        f.documentTypes = f.documentTypes!.filter((t) => t.id !== 'overview');
      }),
    ).toEqual(expect.arrayContaining(['document type "overview" is missing']));
  });

  it('throws every issue from resolveCatalogue and rejects duplicates between built-ins and user definitions', () => {
    const user: ArchetypeDefinitionFile = {
      schemaVersion: 1,
      archetypes: [{ ...clone().archetypes![0]! }],
    };
    expect(() => resolveCatalogue(BUILT_IN_DEFINITIONS, user)).toThrow(CatalogueDefinitionError);
  });

  it('merges valid user definitions', () => {
    const user: ArchetypeDefinitionFile = {
      schemaVersion: 1,
      documentTypes: [
        {
          id: 'runbook',
          title: 'Runbook',
          description: 'Operational steps.',
          useWhen: 'Operators run it.',
          instructions: 'List steps.',
          defaultFilename: 'runbook.md',
        },
      ],
      archetypes: [
        {
          id: 'ops',
          version: 1,
          title: 'Ops',
          description: 'Ops change.',
          useWhen: 'Operations.',
          requirements: [
            { documentType: 'overview', minCount: 1 },
            { documentType: 'runbook', minCount: 1 },
          ],
          templates: [
            { ...clone().archetypes![0]!.templates[0]! },
            {
              id: 'runbook',
              documentType: 'runbook',
              filename: 'runbook.md',
              include: 'optional',
              content: '# {{specificationTitle}}\n',
            },
          ],
        },
      ],
    };
    const merged = resolveCatalogue(BUILT_IN_DEFINITIONS, user);
    expect(merged.findArchetype('ops')?.requirements).toHaveLength(2);
    expect(merged.revision).not.toBe(catalogueRevision());
  });
});

describe('template renderer', () => {
  const values = templateValues({
    title: '  A   "quoted"\ttitle ',
    slug: 'a-title',
    goal: '  the goal  ',
    created: '2026-10-24',
  });

  it('substitutes every placeholder', () => {
    expect(values).toEqual({
      specificationTitle: 'A "quoted" title',
      specificationTitleJson: '"A \\"quoted\\" title"',
      slug: 'a-title',
      goal: 'the goal',
      goalOrPrompt: 'the goal',
      created: '2026-10-24',
    });
    const text = TEMPLATE_PLACEHOLDERS.map((name) => `{{${name}}}`).join('|');
    expect(renderTemplate(text, values)).toBe(
      'A "quoted" title|"A \\"quoted\\" title"|a-title|the goal|the goal|2026-10-24',
    );
  });

  it('uses the fixed fallback for an empty goal', () => {
    const empty = templateValues({ title: 't', slug: 't', goal: ' \n', created: '2026-10-24' });
    expect(empty.goal).toBe('');
    expect(empty.goalOrPrompt).toBe(GOAL_PROMPT_FALLBACK);
    expect(templateValues({ title: 't', slug: 't', created: '2026-10-24' }).goalOrPrompt).toBe(
      'Describe the intended outcome of this specification.',
    );
  });

  it('leaves unknown placeholders as is and never rescans substituted values', () => {
    const tricky = templateValues({
      title: '{{slug}}',
      slug: 'real-slug',
      goal: '{{created}} $& $1',
      created: '2026-10-24',
    });
    expect(renderTemplate('{{unknown}} {{ slug }} {{specificationTitle}} {{goal}}', tricky)).toBe(
      '{{unknown}} {{ slug }} {{slug}} {{created}} $& $1',
    );
  });

  it('is deterministic', () => {
    const content = catalogue.findTemplate('minimal', 'overview')!.content;
    expect(renderTemplate(content, values)).toBe(renderTemplate(content, values));
  });
});

describe('overview template equals the pre-change scaffold (golden fixtures)', () => {
  const overview = catalogue.findTemplate('minimal', 'overview')!;

  it('is the same template in every archetype', () => {
    for (const archetype of catalogue.archetypes) {
      expect(archetype.templates[0]).toEqual(overview);
    }
  });

  it.each(goldenFixtures)('$name', (fixture) => {
    const rendered = renderTemplate(
      overview.content,
      templateValues({
        title: fixture.input.title,
        slug: fixture.slug,
        goal: (fixture.input as { goal?: string }).goal,
        created: fixture.input.created,
      }),
    );
    expect(rendered).toBe(fixture.overview);
  });
});

// --- Conformance with the product document tables --------------------------------------------

const PRODUCT_DOC = readFileSync(
  fileURLToPath(
    new URL('../../../../../docs/product/specflow/specification-documents.md', import.meta.url),
  ),
  'utf8',
).replace(/\r\n/gu, '\n');

function section(heading: string): string[] {
  const lines = PRODUCT_DOC.split('\n');
  const start = lines.findIndex((line) => line.startsWith(heading));
  if (start < 0) throw new Error(`Product document has no section "${heading}".`);
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#+ /u.test(line)) break;
    out.push(line);
  }
  return out;
}

function tableCells(lines: string[]): string[][] {
  return lines
    .filter(
      (line) =>
        line.startsWith('| ') &&
        !line.startsWith('| ---') &&
        !/^\| (Type id|Type|Archetype) /u.test(line),
    )
    .map((line) =>
      line
        .slice(2, -2)
        .split(' | ')
        .map((cell) => cell.trim()),
    );
}

const stripCode = (cell: string) => cell.replace(/^\*{0,2}`/u, '').replace(/`\*{0,2}$/u, '');
const unquote = (cell: string) => cell.replace(/^"/u, '').replace(/"$/u, '');

describe('catalogue strings equal the product document tables', () => {
  it('document type catalogue', () => {
    const rows = tableCells(section('## Document type catalogue (first release)'));
    expect(rows).toHaveLength(9);
    for (const [id, title, description, useWhen, file] of rows) {
      const type = catalogue.findDocumentType(stripCode(id!));
      expect(type, id).toBeDefined();
      expect(type).toMatchObject({
        title,
        description,
        useWhen,
        defaultFilename: stripCode(file!),
      });
    }
  });

  it('authoring instructions', () => {
    const bullets = section('### Authoring instructions of the document types (authoritative)')
      .map((line) => /^- `([a-z-]+)` - "(.*)"$/u.exec(line))
      .filter((match): match is RegExpExecArray => match !== null);
    expect(bullets).toHaveLength(9);
    for (const [, id = '', text] of bullets) {
      expect(catalogue.findDocumentType(id)?.instructions, id).toBe(text);
    }
  });

  it('template skeletons and template instructions', () => {
    const rows = tableCells(section('### Template skeletons (authoritative)'));
    expect(rows).toHaveLength(9);
    for (const [typeCell, headingsCell, instructionsCell] of rows) {
      const id = stripCode(typeCell!);
      const instructions = unquote(instructionsCell!);
      const archetypesWithType = catalogue.archetypes.filter((a) =>
        a.templates.some((t) => t.id === id),
      );
      expect(archetypesWithType.length, id).toBeGreaterThan(0);
      for (const archetype of archetypesWithType) {
        const template = catalogue.findTemplate(archetype.id, id)!;
        expect(template.instructions, `${archetype.id}/${id}`).toBe(instructions);
        if (id === 'overview') continue;
        const headings = headingsCell!.startsWith('(')
          ? []
          : headingsCell!.split('; ').map((heading) => heading.trim());
        const typeTitle = catalogue.findDocumentType(id)!.title;
        expect(template.content, `${archetype.id}/${id}`).toBe(
          [
            `# {{specificationTitle}} - ${typeTitle}`,
            '',
            ...headings.flatMap((h) => [`## ${h}`, '']),
          ].join('\n'),
        );
        expect(templateSkeleton(typeTitle, headings)).toBe(template.content);
      }
    }
  });

  it('archetype catalogue table', () => {
    const rows = tableCells(section('## Archetype catalogue (first release)')).filter(([id]) =>
      id!.startsWith('`'),
    );
    expect(rows).toHaveLength(3);
    for (const [idCell, versionCell, requirementsCell, alwaysCell, suggestedCell] of rows) {
      const archetype = catalogue.findArchetype(stripCode(idCell!))!;
      expect(archetype.version).toBe(Number(versionCell));
      expect(archetype.requirements.map((r) => `${r.documentType}: ${r.minCount}`).join(', ')).toBe(
        requirementsCell,
      );
      expect(
        archetype.templates.filter((t) => t.include === 'always').map((t) => t.filename),
      ).toEqual([stripCode(alwaysCell!)]);
      const suggested = suggestedCell!.split(', ').map((cell) => ({
        id: stripCode(cell),
        preselected: cell.startsWith('**'),
      }));
      expect(
        archetype.templates
          .filter((t) => t.include === 'optional')
          .map((t) => ({ id: t.id, preselected: t.preselected === true })),
      ).toEqual(suggested);
    }
  });

  it('archetype texts', () => {
    const bullets = section('## Archetype catalogue (first release)')
      .map((line) =>
        /^- `([a-z-]+)` - description: "(.*?)" useWhen: "(.*?)" instructions: "(.*)"$/u.exec(line),
      )
      .filter((match): match is RegExpExecArray => match !== null);
    expect(bullets).toHaveLength(3);
    for (const [, id = '', description, useWhen, instructions] of bullets) {
      const archetype = catalogue.findArchetype(id);
      expect(archetype, id).toMatchObject({
        title: id.charAt(0).toUpperCase() + id.slice(1),
        description,
        useWhen,
        instructions,
      });
    }
  });
});
