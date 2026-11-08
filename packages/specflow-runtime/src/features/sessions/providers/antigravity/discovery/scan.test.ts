import { expect, it } from 'vitest';
import { DiscoveryLimits, parseDiscoveryRequest } from './contract';
import { matchesDiscoveryGlob, scanDiscovery } from './scan';
import type { DiscoveryHandle } from './windows-reader';

interface Tree {
  [name: string]: Tree | Buffer | string | Error;
}
function reader(tree: Tree): DiscoveryHandle {
  return {
    directory: true,
    size: 0n,
    *entries() {
      let id = 0n;
      for (const name of Object.keys(tree)) {
        yield {
          name,
          id: id++,
          directory: typeof tree[name] === 'object' && !Buffer.isBuffer(tree[name]),
          reparse: false,
        };
      }
    },
    child(entry) {
      const value = tree[entry.name]!;
      if (value instanceof Error) {
        throw value;
      }

      if (typeof value === 'object' && !Buffer.isBuffer(value)) {
        return reader(value);
      }

      const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);

      return {
        directory: false,
        size: BigInt(bytes.length),
        entries() {
          throw new Error('Not a directory.');
        },
        child() {
          throw new Error('Not a directory.');
        },
        read(max) {
          return bytes.subarray(0, max);
        },
        close() {
          /* No external resources in the in-memory reader. */
        },
      };
    },
    read() {
      throw new Error('Not a file.');
    },
    close() {
      /* No external resources in the in-memory reader. */
    },
  };
}

it('lists nested directories, finds names/types and searches included text with exclusions', () => {
  const root = reader({
    src: {
      'one.ts': 'Needle\nneedle again',
      nested: { 'two.ts': 'a needle', 'skip.ts': 'needle' },
      'image.bin': Buffer.from([0, 1, 2]),
    },
    '.git': { secret: 'needle' },
  });
  expect(
    scanDiscovery(
      root,
      'list_directory',
      parseDiscoveryRequest('list_directory', { path: 'src' }),
    ).entries.map((e) => e.path),
  ).toEqual(['src/one.ts', 'src/nested', 'src/image.bin']);
  expect(
    scanDiscovery(
      root,
      'find_files',
      parseDiscoveryRequest('find_files', { pattern: '*.ts', excludes: ['**/skip.ts'] }),
    ).entries.map((e) => e.path),
  ).toEqual(['src/one.ts', 'src/nested/two.ts']);
  expect(
    scanDiscovery(
      root,
      'find_files',
      parseDiscoveryRequest('find_files', { pattern: '*', type: 'directory' }),
    ).entries.map((e) => e.path),
  ).toEqual(['src', 'src/nested']);
  const result = scanDiscovery(
    root,
    'search_text',
    parseDiscoveryRequest('search_text', {
      query: 'NEEDLE',
      caseInsensitive: true,
      includes: ['**/*.ts'],
      excludes: ['**/skip.ts'],
    }),
  );
  expect(result.status).toBe('complete');
  expect(result.matches.map((m) => [m.path, m.line, m.column])).toEqual([
    ['src/one.ts', 1, 1],
    ['src/one.ts', 2, 1],
    ['src/nested/two.ts', 1, 3],
  ]);
  expect(result.counts.excluded).toBe(2);
});

it('distinguishes complete empty, failed root, partial inaccessible entries and binary exclusion', () => {
  const root = reader({
    good: 'text',
    denied: new Error('access denied'),
    binary: Buffer.from([0, 1]),
  });
  const partial = scanDiscovery(
    root,
    'search_text',
    parseDiscoveryRequest('search_text', { query: 'missing' }),
  );
  expect(partial).toMatchObject({
    status: 'partial',
    matches: [],
    counts: { binary: 1, errors: 1 },
  });
  expect(
    scanDiscovery(
      reader({}),
      'search_text',
      parseDiscoveryRequest('search_text', { query: 'missing' }),
    ),
  ).toMatchObject({ status: 'complete', matches: [] });
  expect(
    scanDiscovery(
      root,
      'find_files',
      parseDiscoveryRequest('find_files', { path: 'missing', pattern: '*' }),
    ).status,
  ).toBe('failed');
  expect(
    scanDiscovery(root, 'list_directory', parseDiscoveryRequest('list_directory', { path: '.git' }))
      .status,
  ).toBe('failed');
});

it('bounds output, traversal depth, file sizes and traversal work without claiming empty completion', () => {
  const many = Object.fromEntries(Array.from({ length: 10002 }, (_, i) => ['file' + i, 'text']));
  const output = scanDiscovery(
    reader(many),
    'find_files',
    parseDiscoveryRequest('find_files', { pattern: '*' }),
  );
  expect(output.status).toBe('truncated');
  expect(output.entries).toHaveLength(DiscoveryLimits.results);
  const visits = scanDiscovery(
    reader(many),
    'find_files',
    parseDiscoveryRequest('find_files', { pattern: 'absent' }),
  );
  expect(visits).toMatchObject({
    status: 'truncated',
    reasons: ['entry-limit'],
    counts: { visited: DiscoveryLimits.entries },
  });
  const depth = scanDiscovery(
    reader({ dir: { inside: 'match' } }),
    'search_text',
    parseDiscoveryRequest('search_text', { query: 'match', maxDepth: 0 }),
  );
  expect(depth).toMatchObject({ status: 'truncated', matches: [], reasons: ['depth-limit'] });
  const large = scanDiscovery(
    reader({ big: Buffer.alloc(DiscoveryLimits.fileBytes + 1) }),
    'search_text',
    parseDiscoveryRequest('search_text', { query: 'match' }),
  );
  expect(large).toMatchObject({
    status: 'truncated',
    reasons: ['large-file'],
    counts: { bytes: 0 },
  });
  expect(Buffer.byteLength(JSON.stringify(output))).toBeLessThanOrEqual(
    DiscoveryLimits.outputBytes,
  );
});

it('supports one match per file and literal metacharacters without evaluating regex', () => {
  const result = scanDiscovery(
    reader({ code: '.*\n.*' }),
    'search_text',
    parseDiscoveryRequest('search_text', { query: '.*', matchPerLine: false }),
  );
  expect(result.matches).toHaveLength(1);
  expect(result.matches[0]?.text).toBe('.*');
});

it('skips installed dependency trees by default and permits an explicit bounded dependency read', () => {
  const root = reader({
    node_modules: { library: { 'index.ts': 'needle' } },
    src: { 'main.ts': 'needle' },
  });
  const defaults = scanDiscovery(
    root,
    'search_text',
    parseDiscoveryRequest('search_text', { query: 'needle' }),
  );
  expect(defaults.status).toBe('complete');
  expect(defaults.matches.map((m) => m.path)).toEqual(['src/main.ts']);
  const explicit = scanDiscovery(
    root,
    'search_text',
    parseDiscoveryRequest('search_text', { query: 'needle', excludes: [] }),
  );
  expect(explicit.matches.map((m) => m.path)).toEqual([
    'node_modules/library/index.ts',
    'src/main.ts',
  ]);
});

it.each([{ includes: ['**/*.md'] }, { excludes: ['**/*.ts'] }])(
  'filters an explicitly selected file before reading its content: %j',
  (filters) => {
    const result = scanDiscovery(
      reader({ src: { 'code.ts': 'needle' } }),
      'search_text',
      parseDiscoveryRequest('search_text', { path: 'src/code.ts', query: 'needle', ...filters }),
    );
    expect(result).toMatchObject({
      status: 'complete',
      matches: [],
      counts: { files: 0, bytes: 0 },
    });
  },
);

it.each(['list_directory', 'find_files', 'search_text'] as const)(
  '%s prunes an explicitly selected default-excluded directory before opening it',
  (tool) => {
    const result = scanDiscovery(
      reader({ node_modules: new Error('Excluded directory must not be opened') }),
      tool,
      parseDiscoveryRequest(tool, {
        path: 'node_modules',
        ...(tool === 'find_files'
          ? { pattern: '*' }
          : tool === 'search_text'
            ? { query: 'needle' }
            : {}),
      }),
    );
    expect(result).toMatchObject({
      status: 'complete',
      entries: [],
      matches: [],
      counts: { visited: 0, files: 0, bytes: 0, excluded: 1, errors: 0 },
    });
  },
);

it('cannot bypass an excluded ancestor by selecting a nested starting file', () => {
  const result = scanDiscovery(
    reader({ node_modules: { library: { 'index.ts': 'needle' } } }),
    'search_text',
    parseDiscoveryRequest('search_text', {
      path: 'node_modules/library/index.ts',
      query: 'needle',
      excludes: ['node_modules'],
    }),
  );
  expect(result).toMatchObject({
    status: 'complete',
    matches: [],
    counts: { files: 0, bytes: 0, excluded: 1 },
  });
});

it.each(['node_modules', 'node_modules/library/index.ts'])(
  'permits an explicit dependency start %s when defaults are cleared',
  (path) => {
    const result = scanDiscovery(
      reader({ node_modules: { library: { 'index.ts': 'needle' } } }),
      'search_text',
      parseDiscoveryRequest('search_text', {
        path,
        query: 'needle',
        includes: ['**/*.ts'],
        excludes: [],
      }),
    );
    expect(result.status).toBe('complete');
    expect(result.matches.map((match) => match.path)).toEqual(['node_modules/library/index.ts']);
    expect(result.counts.files).toBe(1);
  },
);

it.each(['.git/secret', '.nevo/local/secret', '.agents/mcp_config.json'])(
  'does not override private starting-path denial for %s with custom filters',
  (path) => {
    for (const excludes of [[], ['**']]) {
      const result = scanDiscovery(
        reader({}),
        'search_text',
        parseDiscoveryRequest('search_text', { path, query: 'needle', includes: ['**'], excludes }),
      );
      expect(result).toMatchObject({
        status: 'failed',
        matches: [],
        counts: { files: 0, bytes: 0 },
      });
    }
  },
);

it.each(['../outside', '/absolute', 'C:/outside', 'a\\b', 'name:stream', 'a/../b', 'file.'])(
  'rejects unsupported path %s',
  (path) => {
    expect(() => parseDiscoveryRequest('list_directory', { path })).toThrow();
  },
);
it.each([
  { query: 'x', IsRegex: true },
  { query: 'x', arbitrary: true },
  { query: '' },
  { query: 'x', includes: ['[bad]'] },
  { query: 'x', maxDepth: 100 },
  { query: 'x', caseInsensitive: 'true' },
])('rejects malformed or unsupported arguments %#', (args) => {
  expect(() => parseDiscoveryRequest('search_text', args)).toThrow();
});
it.each([
  ['**/*.ts', 'a.ts', true],
  ['**/*.ts', 'a/b.ts', true],
  ['src/**', 'src', true],
  ['src/?o.ts', 'src/no.ts', true],
  ['src/*.ts', 'src/a/b.ts', false],
])('matches bounded glob %s against %s', (pattern, path, expected) => {
  expect(matchesDiscoveryGlob(pattern, path)).toBe(expected);
});
