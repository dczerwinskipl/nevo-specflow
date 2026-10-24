import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { type ArchetypeDefinitionFile } from '@nevo/specflow-contracts/documents';
import { describe, expect, it } from 'vitest';

import goldenFixtures from './fixtures/overview-golden.json';
import { BUILT_IN_DEFINITIONS, templateSkeleton } from './builtins';
import { catalogueRevision, getBuiltInCatalogue, resolveCatalogue } from './catalogue';
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
