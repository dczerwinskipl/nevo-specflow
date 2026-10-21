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
      'create.workspace.settings.unavailableItemBranch',
      'create.workspace.settings.unavailableItemNoBranch',
      'documents.tree.skippedItem',
      'common.pullRequestNumber',
      'navigation.uiPlayground',
      'playground.title',
      'sessions.demo.writer',
      'specification.changesSourcePr',
      'specifications.openSignal',
    ]);
    const identical = plKeys.filter(
      (key) =>
        plMessages[key] === enMessages[key] &&
        /\s/.test(plMessages[key] ?? '') &&
        !sameInBoth.has(key),
    );
    expect(identical).toEqual([]);
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
