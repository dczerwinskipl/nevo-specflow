import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import goldenFixtures from '../archetypes/fixtures/overview-golden.json';
import { toArchetypeCatalogue } from '../archetypes/projection';
import { renderTemplate, templateValues } from '../archetypes/template-renderer';
import { createDefaultDefinitionRegistry } from './kinds';
import { loadDefinitions, type LoadResult } from './loader';
import { resolveProjectCatalogue, type ProjectCatalogue } from './project-catalogue';
import {
  DefinitionSeedError,
  SEED_DIRECTORY_NAME,
  locateSeedDirectory,
  openSeedSource,
} from './seed';

/**
 * The shipped seed files against the product document's structural matrix. The seeds own the long strings; the matrix (ids, titles, default files,
 * requirements, include, preselected, skeleton headings) is checked against the product document.
 */

const registry = createDefaultDefinitionRegistry();

let seedDirectory: string;
let loaded: LoadResult;
let project: ProjectCatalogue;

beforeAll(async () => {
  const seeds = await openSeedSource();
  seedDirectory = seeds.directory;
  loaded = await loadDefinitions(seeds.source, registry);
  project = resolveProjectCatalogue(loaded);
});

describe('seed files', () => {
  it('give the shipped document types Design System icons, and the API catalogue carries them', () => {
    const icons = Object.fromEntries(
      toArchetypeCatalogue(project).documentTypes.map((type) => [type.id, type.icon]),
    );
    // The owner's icons; the Engine does not check the registry (the UI falls back). `note` has none.
    expect(icons).toEqual({
      architecture: 'network',
      backend: 'server',
      behaviour: 'list-ordered',
      decisions: 'file-check',
      note: undefined,
      overview: 'book-open',
      research: 'file-search',
      'user-story': 'book-user',
      ux: 'panels-top-left',
    });
  });

  it('load without a single problem', () => {
    expect(loaded.problems).toEqual([]);
    expect(project.catalogue.documentTypes).toHaveLength(9);
    expect(project.catalogue.archetypes.map((archetype) => archetype.id)).toEqual([
      'architecture',
      'feature',
      'minimal',
    ]);
  });

  it('are stored with LF line endings and carry no stamp, hash or origin', async () => {
    const seen: string[] = [];
    const walk = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await walk(path);
        else {
          seen.push(path);
          const text = await readFile(path, 'utf8');
          expect(text, path).not.toContain('\r');
          expect(text, path).not.toMatch(/^(origin|hash|sha256|stamp):/mu);
        }
      }
    };
    await walk(seedDirectory);
    expect(seen.length).toBe(9 + 3 + 1);
  });

  it('pin the revision of the shipped catalogue', () => {
    // Recompute (and re-pin) only when the shipped definitions change on purpose.
    expect(project.catalogue.revision).toBe(
      '900fd261f4bb33c4f816e81d8c002baad92c2b85429d6f2bfe2c24ac2bdfe6e4',
    );
  });
});

describe('seed files against the product document matrix', () => {
  let doc: string;

  beforeAll(async () => {
    doc = (
      await readFile(
        fileURLToPath(
          new URL(
            '../../../../../docs/product/specflow/specification-documents.md',
            import.meta.url,
          ),
        ),
        'utf8',
      )
    ).replace(/\r\n/gu, '\n');
  });

  function section(heading: string): string[] {
    const lines = doc.split('\n');
    const start = lines.findIndex((line) => line.startsWith(heading));
    if (start < 0) throw new Error(`The product document has no section "${heading}".`);
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

  it('document type ids, titles and default files', () => {
    const rows = tableCells(section('## Document type catalogue (first release)'));
    expect(rows).toHaveLength(9);
    expect(project.catalogue.documentTypes.map((type) => type.id).sort()).toEqual(
      rows.map(([id]) => stripCode(id!)).sort(),
    );
    for (const [id, title, , , file] of rows) {
      expect(project.catalogue.findDocumentType(stripCode(id!)), id).toMatchObject({
        title,
        defaultFilename: stripCode(file!),
      });
    }
  });

  it('archetype versions, requirements, scaffolded files and suggestions with preselection', () => {
    const rows = tableCells(section('## Archetype catalogue (first release)')).filter(([id]) =>
      id!.startsWith('`'),
    );
    expect(rows).toHaveLength(3);
    expect(project.catalogue.archetypes.map((archetype) => archetype.id).sort()).toEqual(
      rows.map(([id]) => stripCode(id!)).sort(),
    );
    for (const [idCell, versionCell, requirementsCell, alwaysCell, suggestedCell] of rows) {
      const archetype = project.catalogue.findArchetype(stripCode(idCell!));
      expect(archetype, idCell).toBeDefined();
      expect(archetype?.version).toBe(Number(versionCell));
      expect(
        archetype?.requirements
          .map((requirement) => `${requirement.documentType}: ${requirement.minCount}`)
          .join(', '),
      ).toBe(requirementsCell);
      expect(
        archetype?.templates
          .filter((template) => template.include === 'always')
          .map((template) => template.filename),
      ).toEqual([stripCode(alwaysCell!)]);
      expect(
        archetype?.templates
          .filter((template) => template.include === 'optional')
          .map((template) => ({
            id: template.id,
            preselected: 'preselected' in template && template.preselected === true,
          })),
      ).toEqual(
        suggestedCell!.split(', ').map((cell) => ({
          id: stripCode(cell),
          preselected: cell.startsWith('**'),
        })),
      );
    }
  });

  it('template skeletons follow the one rule and the instructions column', () => {
    const rows = tableCells(section('### Template skeletons (authoritative)'));
    expect(rows).toHaveLength(9);
    for (const [typeCell, headingsCell, instructionsCell] of rows) {
      const id = stripCode(typeCell!);
      const instructions = instructionsCell!.replace(/^"/u, '').replace(/"$/u, '');
      const using = project.catalogue.archetypes.filter((archetype) =>
        archetype.templates.some((template) => template.id === id),
      );
      expect(using.length, id).toBeGreaterThan(0);
      for (const archetype of using) {
        const template = project.catalogue.findTemplate(archetype.id, id);
        expect(template?.instructions, `${archetype.id}/${id}`).toBe(instructions);
        if (id === 'overview') continue;
        const headings = headingsCell!.startsWith('(')
          ? []
          : headingsCell!.split('; ').map((heading) => heading.trim());
        const title = project.catalogue.findDocumentType(id)?.title;
        expect(template?.content, `${archetype.id}/${id}`).toBe(
          [
            `# {{specificationTitle}} - ${title}`,
            '',
            ...headings.flatMap((h) => [`## ${h}`, '']),
          ].join('\n'),
        );
      }
    }
  });

  it('archetype titles are the capitalised ids named by the document', () => {
    expect(doc).toContain(
      'Display titles of the archetypes are "Minimal", "Feature" and "Architecture".',
    );
    expect(project.catalogue.archetypes.map((archetype) => archetype.title).sort()).toEqual([
      'Architecture',
      'Feature',
      'Minimal',
    ]);
  });
});

describe('the overview template of the seeds', () => {
  it('is one template file shared by every archetype', () => {
    const [first, ...rest] = project.catalogue.archetypes.map((archetype) =>
      archetype.templates.find((template) => template.id === 'overview'),
    );
    expect(first?.content).toContain('{{goalOrPrompt}}');
    for (const other of rest) expect(other).toEqual(first);
  });

  it.each(goldenFixtures)('renders the pre-change scaffold: $name', (fixture) => {
    const overview = project.catalogue.findTemplate('minimal', 'overview');
    const rendered = renderTemplate(
      overview?.content ?? '',
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

describe('locating the seed folder', () => {
  let scratch: string;

  beforeAll(async () => {
    scratch = await realpath(await mkdtemp(join(tmpdir(), 'nevo-seed-')));
  });

  afterAll(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('finds the folder of this package from the source tree', async () => {
    expect(basename(await locateSeedDirectory())).toBe(SEED_DIRECTORY_NAME);
    expect(await locateSeedDirectory()).toBe(seedDirectory);
  });

  it('finds the folder next to a bundle', async () => {
    const bundle = join(scratch, 'bundle');
    await mkdir(join(bundle, SEED_DIRECTORY_NAME, 'document-type'), { recursive: true });
    await writeFile(join(bundle, 'bin.js'), '');
    const found = await locateSeedDirectory({
      fromUrl: pathToFileURL(join(bundle, 'bin.js')).href,
    });
    expect(found).toBe(join(bundle, SEED_DIRECTORY_NAME));
  });

  it('does not search above the three known layouts', async () => {
    // A seed folder four levels up is not the package's: the lookup must not climb to it.
    const far = join(scratch, 'far');
    await mkdir(join(far, SEED_DIRECTORY_NAME, 'document-type'), { recursive: true });
    const deep = join(far, 'a', 'b', 'c', 'd');
    await mkdir(deep, { recursive: true });
    await expect(
      locateSeedDirectory({ fromUrl: pathToFileURL(join(deep, 'seed.js')).href }),
    ).rejects.toBeInstanceOf(DefinitionSeedError);
    // Three levels up (the source layout) is found.
    const source = join(far, 'src', 'specs', 'definitions');
    await mkdir(source, { recursive: true });
    expect(
      await locateSeedDirectory({ fromUrl: pathToFileURL(join(source, 'seed.ts')).href }),
    ).toBe(join(far, SEED_DIRECTORY_NAME));
  });

  it('refuses when no seed folder is installed', async () => {
    const empty = join(scratch, 'empty', 'deeper');
    await mkdir(empty, { recursive: true });
    await expect(
      locateSeedDirectory({ fromUrl: pathToFileURL(join(empty, 'bin.js')).href }),
    ).rejects.toBeInstanceOf(DefinitionSeedError);
  });

  it('opens an explicit folder', async () => {
    const opened = await openSeedSource({ directory: seedDirectory });
    expect(opened.directory).toBe(seedDirectory);
  });
});
