import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DocsConfigError } from '../errors';
import { DEFAULT_DOCS_SETTINGS, isNonAuthoritative, parseDocsConfig } from './docs-settings';
import { loadDocsSettings } from './load-docs-settings';

describe('parseDocsConfig', () => {
  it('uses the ADR 0020 defaults when the namespace or a key is absent', () => {
    expect(parseDocsConfig(undefined)).toEqual({
      root: 'docs',
      taxonomy: {},
      nonAuthoritative: [],
      exclude: [],
      search: { semantic: false },
    });
    expect(parseDocsConfig({ taxonomy: { areas: ['cli'] } })).toEqual({
      ...DEFAULT_DOCS_SETTINGS,
      taxonomy: { areas: ['cli'] },
    });
  });

  it('normalizes a trailing slash on the root and the prefixes', () => {
    expect(
      parseDocsConfig({
        root: 'handbook/',
        nonAuthoritative: ['ideas/', 'drafts'],
        exclude: ['templates/'],
      }),
    ).toEqual({
      ...DEFAULT_DOCS_SETTINGS,
      root: 'handbook',
      nonAuthoritative: ['ideas', 'drafts'],
      exclude: ['templates'],
    });
    expect(parseDocsConfig({ search: { semantic: true } }).search).toEqual({ semantic: true });
  });

  it.each([
    [{ rooot: 'docs' }, "Unknown configuration key 'docs.rooot'."],
    [{ taxonomy: { tags: ['x'] } }, "Unknown configuration key 'docs.taxonomy.tags'."],
    [{ root: '../elsewhere' }, 'docs.root must be a relative directory path'],
    [{ root: '/abs' }, 'docs.root must be a relative directory path'],
    [{ root: 'C:/docs' }, 'docs.root must be a relative directory path'],
    [{ root: '.' }, 'docs.root must be a relative directory path'],
    [{ taxonomy: { scopes: [] } }, 'docs.taxonomy.scopes must be a non-empty list of strings.'],
    [{ taxonomy: { areas: ['cli', 'cli'] } }, "docs.taxonomy.areas lists 'cli' more than once."],
    [{ nonAuthoritative: 'ideas' }, 'docs.nonAuthoritative must be a list of path prefixes.'],
    [{ nonAuthoritative: ['a\\b'] }, 'docs.nonAuthoritative[0] must be a relative directory path'],
    [{ exclude: 'templates' }, 'docs.exclude must be a list of path prefixes.'],
    [{ exclude: ['../x'] }, 'docs.exclude[0] must be a relative directory path'],
    [{ search: { semantic: 'yes' } }, 'docs.search.semantic must be true or false.'],
    [{ search: { mode: 'hybrid' } }, "Unknown configuration key 'docs.search.mode'."],
    ['docs', 'docs must be an object.'],
  ])('rejects %j', (value, message) => {
    expect(() => parseDocsConfig(value)).toThrow(message);
  });

  it('matches non-authoritative prefixes as directories under the root', () => {
    const settings = parseDocsConfig({ nonAuthoritative: ['ideas'] });
    expect(isNonAuthoritative(settings, 'docs/ideas/x.md')).toBe(true);
    expect(isNonAuthoritative(settings, 'docs/ideas-x.md')).toBe(false);
    expect(isNonAuthoritative(settings, 'ideas/x.md')).toBe(false);
  });
});

describe('loadDocsSettings', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

  function project(files: Record<string, string>) {
    const root = mkdtempSync(join(tmpdir(), 'specflow-docs-config-'));
    dirs.push(root);
    mkdirSync(join(root, '.nevo', 'local'), { recursive: true });
    for (const [path, content] of Object.entries(files)) {
      writeFileSync(join(root, path), content);
    }

    return {
      projectConfigPath: join(root, '.nevo', 'config.yaml'),
      localConfigPath: join(root, '.nevo', 'local', 'config.yaml'),
    };
  }

  it('returns the defaults without either configuration file', () => {
    expect(loadDocsSettings(project({}))).toEqual({
      docs: DEFAULT_DOCS_SETTINGS,
      embeddings: undefined,
    });
  });

  it('reads only the docs namespace and ignores other capabilities', () => {
    const paths = project({
      '.nevo/config.yaml': 'specs: { anything: [1, 2] }\ndocs:\n  root: handbook\n',
      '.nevo/local/config.yaml': 'runtime: { not: validated }\n',
    });
    expect(loadDocsSettings(paths).docs.root).toBe('handbook');
  });

  it('rejects a local docs section', () => {
    const paths = project({ '.nevo/local/config.yaml': 'docs:\n  root: mine\n' });
    expect(() => loadDocsSettings(paths)).toThrow(DocsConfigError);
    expect(() => loadDocsSettings(paths)).toThrow(/project-owned and cannot be set locally/);
  });

  it('names the project file in a namespace problem', () => {
    const paths = project({ '.nevo/config.yaml': 'docs:\n  root: ../up\n' });
    expect(() => loadDocsSettings(paths)).toThrow(`${paths.projectConfigPath}: docs.root`);
  });
});
