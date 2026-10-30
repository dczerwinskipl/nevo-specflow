// Repository invariant: no archetype or document type text is compiled into the product. The text of
// the shipped definitions lives in the seed files only; this test loads every long string of the seeds
// and fails when one occurs in a source file of any package.
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  createDefaultDefinitionRegistry,
  loadDefinitions,
  openSeedSource,
} from '../../src/specs/definitions';

const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));

/** Files that may hold the text. Paths are relative to the repository root, with `/`. */
const EXEMPT = new Set<string>([
  // The Runtime demo keeps its own fixture catalogue; it is not a product source and imports nothing
  // from the Engine catalogue.
  'packages/specflow-runtime/src/demo/catalogue.ts',
  // The copy `nevo-specflow definitions install` writes into a demo project; by design the same
  // texts and templates as the seeds, verified against them by its own `definitions.test.ts`.
  'packages/specflow-runtime/src/demo/definitions.ts',
  // Demo-only document seeds: quotes a document type and two archetype ids for unrelated demo
  // Specifications, not the shipped catalogue.
  'packages/specflow-runtime/src/features/documents/demo/seed-files.ts',
]);

const SOURCE_FILE = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/u;
const TEST_FILE = /(?:\.test\.|\.spec\.|\.stories\.|test-support\.|stories-support\.)/u;
const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.turbo',
  'test',
]);

async function sourceFiles(directory: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        out.push(...(await sourceFiles(join(directory, entry.name))));
      }
    } else if (SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) {
      out.push(join(directory, entry.name));
    }
  }

  return out;
}

const MIN_LENGTH = 24;

let strings: string[];
let escaped: string[];
let files: string[];

beforeAll(async () => {
  const seeds = await openSeedSource();
  const loaded = await loadDefinitions(seeds.source, createDefaultDefinitionRegistry());
  expect(loaded.problems).toEqual([]);
  const collected = new Set<string>();
  const add = (text: string | undefined): void => {
    if (text === undefined) {
      return;
    }

    if (text.length >= MIN_LENGTH) {
      collected.add(text);
    }

    // A long text split over lines is also found one line at a time.
    for (const line of text.split('\n')) {
      if (line.trim().length >= MIN_LENGTH) {
        collected.add(line.trim());
      }
    }
  };

  for (const types of loaded.definitions.get('document-type')?.values() ?? []) {
    const type = types.entity as { description: string; useWhen: string; instructions: string };
    add(type.description);
    add(type.useWhen);
    add(type.instructions);
  }

  for (const archetypes of loaded.definitions.get('specification-archetype')?.values() ?? []) {
    const archetype = archetypes.entity as {
      description: string;
      useWhen: string;
      instructions?: string;
      templates: { instructions?: string; content: string }[];
    };
    add(archetype.description);
    add(archetype.useWhen);
    add(archetype.instructions);
    for (const template of archetype.templates) {
      add(template.instructions);
      // The overview template is long free text; the skeletons are generated headings.
      if (template.content.length > 200) {
        add(template.content);
      }
    }
  }

  strings = [...collected];
  // The same strings as they appear inside a JSON or JavaScript string literal (escaped quotes and
  // line breaks), which a plain substring search over the source would miss.
  escaped = strings
    .map((text) => JSON.stringify(text).slice(1, -1))
    .filter((text) => !strings.includes(text));

  const packages = await readdir(join(repositoryRoot, 'packages'), { withFileTypes: true });
  files = [];
  for (const entry of packages) {
    if (!entry.isDirectory()) {
      continue;
    }

    const source = join(repositoryRoot, 'packages', entry.name, 'src');
    try {
      files.push(...(await sourceFiles(source)));
    } catch {
      // a package without a src folder
    }
  }
});

describe('no definition text is compiled into the product', () => {
  it('knows enough strings and files to mean something', () => {
    expect(strings.length).toBeGreaterThan(30);
    expect(files.length).toBeGreaterThan(200);
  });

  it('finds no seed string in a non-test source file outside the exempt list', async () => {
    const offenders: string[] = [];
    for (const file of files) {
      const path = relative(repositoryRoot, file).split(sep).join('/');
      if (EXEMPT.has(path)) {
        continue;
      }

      const text = (await readFile(file, 'utf8')).replace(/\r\n/gu, '\n');
      const hit = [...strings, ...escaped].find((candidate) => text.includes(candidate));
      if (hit !== undefined) {
        offenders.push(`${path}: "${hit.slice(0, 50)}..."`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('finds no source file that names the three shipped archetypes together outside the exempt list', async () => {
    const offenders: string[] = [];
    for (const file of files) {
      const path = relative(repositoryRoot, file).split(sep).join('/');
      if (EXEMPT.has(path)) {
        continue;
      }

      const text = await readFile(file, 'utf8');
      const quoted = (id: string): boolean => new RegExp(`['"\`]${id}['"\`]`, 'u').test(text);
      if (quoted('architecture') && quoted('feature') && quoted('minimal')) {
        offenders.push(path);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('also searches the escaped and the per-line forms of the seed texts', () => {
    expect(escaped.length).toBeGreaterThan(0);
    const multiLine = strings.find((text) => text.includes('\n') && text.length > 100);
    expect(multiLine).toBeDefined();
    const line = multiLine?.split('\n').find((candidate) => candidate.trim().length >= MIN_LENGTH);
    expect(strings).toContain(line?.trim());
    expect(escaped).toContain(JSON.stringify(multiLine).slice(1, -1));
  });

  it('keeps the exempt list to files that still exist', async () => {
    for (const path of EXEMPT) {
      await expect(readFile(join(repositoryRoot, ...path.split('/')), 'utf8')).resolves.toBeTypeOf(
        'string',
      );
    }
  });
});
