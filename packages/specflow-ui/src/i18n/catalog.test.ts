import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import en from './locales/en.json';
import pl from './locales/pl.json';

const sourceRoot = fileURLToPath(new URL('..', import.meta.url));
const pluralForms = ['one', 'few', 'many', 'other'] as const;

function flatten(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value };
  if (typeof value !== 'object' || value === null) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, nested]) =>
      Object.entries(flatten(nested, prefix ? `${prefix}.${key}` : key)),
    ),
  );
}

/** Every TypeScript file that may translate a key: sources, stories, tests and story support. */
function allFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : allFiles(path);
    return /\.tsx?$/.test(entry.name) && entry.name !== 'catalog.test.ts' ? [path] : [];
  });
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'test-support' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.(test|stories)\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const plKeys = Object.keys(flatten(pl));
const enKeys = Object.keys(flatten(en));
const namespaces = new Set(plKeys.map((key) => key.split('.')[0]));
const pluralBase = (key: string) => key.replace(/_(one|few|many|other)$/, '');
const catalogueBases = new Set(plKeys.map(pluralBase));

describe('message catalogues', () => {
  it('have identical key sets in Polish and English', () => {
    expect(enKeys.sort()).toEqual(plKeys.sort());
  });

  it('define every plural form (Polish needs one, few, many and other) in both languages', () => {
    for (const keys of [plKeys, enKeys]) {
      const bases = new Set(
        keys.filter((key) => /_(one|few|many|other)$/.test(key)).map(pluralBase),
      );
      for (const base of bases)
        for (const form of pluralForms)
          expect(keys, `${base}_${form}`).toContain(`${base}_${form}`);
    }
  });

  it('do not copy Polish text into English (except listed product names and templates)', () => {
    const enMessages = flatten(en);
    const plMessages = flatten(pl);
    // Product names and message templates that are the same in both languages.
    const sameInBoth = new Set([
      'create.workspace.settings.unavailableReason',
      'documents.tree.skippedItem',
      'common.pullRequestNumber',
      'playground.title',
      'sessions.demo.writer',
      'specification.changesSourcePr',
    ]);
    const identical = plKeys.filter(
      (key) =>
        plMessages[key] === enMessages[key] &&
        /\s/.test(plMessages[key] ?? '') &&
        !sameInBoth.has(key),
    );
    expect(identical).toEqual([]);
  });

  it('contain no key that nothing translates', () => {
    const text = [
      ...allFiles(sourceRoot),
      ...allFiles(fileURLToPath(new URL('../../test-support', import.meta.url))),
    ]
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    // A key built at run time (a template literal ending in `${...}` after a static prefix) keeps
    // everything below that prefix, except the two prefixes whose subtree is wider than what is
    // built: those list the keys they really build.
    const broad = new Set(['specifications.', 'taskDetails.']);
    const dynamicPrefixes = [...text.matchAll(/[`'"]([A-Za-z0-9_.-]+\.)(?:\$\{|['"`]\s*\+)/g)]
      .map((match) => match[1] ?? '')
      .filter((prefix) => !broad.has(prefix));
    const built = [
      ...['noResults', 'emptyCurrent', 'emptyArchive'].flatMap((kind) => [
        `specifications.${kind}`,
        `specifications.${kind}Description`,
      ]),
      'taskDetails.startedAt',
      'taskDetails.completedAt',
    ];
    const quotes = ["'", '"', '`'];
    const unused = [...catalogueBases].filter(
      (key) =>
        !built.includes(key) &&
        !dynamicPrefixes.some((prefix) => key.startsWith(prefix)) &&
        !quotes.some((quote) => text.includes(`${quote}${key}${quote}`)),
    );
    expect(unused).toEqual([]);
  });

  it('contain every literal key that source files translate', () => {
    // Keys passed to `t(...)`, `message(...)`, `translateNow(...)`, `i18nKey=` or `key:` (message objects).
    const literal =
      /(?:bt\(\s*|bmessage\(\s*|btranslateNow\(\s*|i18nKey=\{?\s*|bkey:\s*)['"`]([a-z][A-Za-z]*(?:\.[A-Za-z0-9_-]+)+\.?)(['"`]|\$\{)/g;
    const missing: string[] = [];
    for (const file of sourceFiles(sourceRoot)) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(literal)) {
        const key = match[1] ?? '';
        if (!namespaces.has(key.split('.')[0])) continue;
        if (match[2] === '${') {
          // Dynamic key: the static prefix must lead to at least one catalogue entry.
          if (!plKeys.some((entry) => entry.startsWith(key))) missing.push(`${file}: ${key}\${…}`);
        } else if (!catalogueBases.has(key) && !plKeys.includes(key)) {
          missing.push(`${file}: ${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
