import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DocsConfigError } from '../errors';
import { DEFAULT_DOCS_FILE_SETTINGS, isProposal, parseDocsFile } from './docs-file';
import { DEFAULT_DOCS_SETTINGS, parseDocsConfig } from './docs-settings';
import { loadDocsFile, loadDocsSettings } from './load-docs-settings';

describe('parseDocsConfig', () => {
  it('uses the ADR 0020 defaults when the namespace or a key is absent', () => {
    expect(parseDocsConfig(undefined)).toEqual({ root: 'docs', search: { semantic: false } });
    expect(parseDocsConfig({ root: 'handbook/' })).toEqual({
      ...DEFAULT_DOCS_SETTINGS,
      root: 'handbook',
    });
    expect(parseDocsConfig({ search: { semantic: true } }).search).toEqual({ semantic: true });
  });

  it.each([
    [{ rooot: 'docs' }, "Unknown configuration key 'docs.rooot'."],
    [{ root: '../elsewhere' }, 'docs.root must be a relative directory path'],
    [{ root: '/abs' }, 'docs.root must be a relative directory path'],
    [{ root: 'C:/docs' }, 'docs.root must be a relative directory path'],
    [{ root: '.' }, 'docs.root must be a relative directory path'],
    [{ search: { semantic: 'yes' } }, 'docs.search.semantic must be true or false.'],
    [{ search: { mode: 'hybrid' } }, "Unknown configuration key 'docs.search.mode'."],
    ['docs', 'docs must be an object.'],
    [{ taxonomy: { areas: ['cli'] } }, "Unknown configuration key 'docs.taxonomy'."],
  ])('rejects %j', (value, message) => {
    expect(() => parseDocsConfig(value)).toThrow(message);
  });
});

describe('parseDocsFile', () => {
  it('uses the defaults without a file and normalizes trailing slashes', () => {
    expect(parseDocsFile(undefined)).toEqual(DEFAULT_DOCS_FILE_SETTINGS);
    expect(
      parseDocsFile({
        taxonomy: { areas: ['cli'] },
        proposals: ['ideas/', 'drafts'],
        exclude: ['templates/'],
      }),
    ).toEqual({
      taxonomy: { areas: ['cli'] },
      proposals: ['ideas', 'drafts'],
      exclude: ['templates'],
    });
  });

  it.each([
    [{ root: 'docs' }, "Unknown configuration key 'root'."],
    [{ taxonomy: { tags: ['x'] } }, "Unknown configuration key 'taxonomy.tags'."],
    [{ taxonomy: { scopes: [] } }, 'taxonomy.scopes must be a non-empty list of strings.'],
    [{ taxonomy: { areas: ['cli', 'cli'] } }, "taxonomy.areas lists 'cli' more than once."],
    [{ nonAuthoritative: ['ideas/'] }, "Unknown configuration key 'nonAuthoritative'."],
    [{ proposals: 'ideas' }, 'proposals must be a list of path prefixes.'],
    [{ proposals: ['a\\b'] }, 'proposals[0] must be a relative directory path'],
    [{ exclude: ['../x'] }, 'exclude[0] must be a relative directory path'],
  ])('rejects %j', (value, message) => {
    expect(() => parseDocsFile(value)).toThrow(message);
  });

  it('matches proposal prefixes as directories under the root', () => {
    const settings = { root: 'docs', ...parseDocsFile({ proposals: ['ideas'] }) };
    expect(isProposal(settings, 'docs/ideas/x.md')).toBe(true);
    expect(isProposal(settings, 'docs/ideas-x.md')).toBe(false);
    expect(isProposal(settings, 'ideas/x.md')).toBe(false);
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

  it('reads <docs.root>/docs.yaml and names it in a problem; an empty file is the defaults', () => {
    const paths = project({});
    const root = join(paths.projectConfigPath, '..', '..');
    mkdirSync(join(root, 'docs'));
    expect(loadDocsFile(root, 'docs')).toEqual(DEFAULT_DOCS_FILE_SETTINGS);
    writeFileSync(join(root, 'docs', 'docs.yaml'), '');
    expect(loadDocsFile(root, 'docs')).toEqual(DEFAULT_DOCS_FILE_SETTINGS);
    writeFileSync(join(root, 'docs', 'docs.yaml'), 'exclude: [templates/]\n');
    expect(loadDocsFile(root, 'docs').exclude).toEqual(['templates']);
    writeFileSync(join(root, 'docs', 'docs.yaml'), 'search: { semantic: true }\n');
    expect(() => loadDocsFile(root, 'docs')).toThrow(
      `${join(root, 'docs', 'docs.yaml')}: Unknown configuration key 'search'.`,
    );
  });
});
