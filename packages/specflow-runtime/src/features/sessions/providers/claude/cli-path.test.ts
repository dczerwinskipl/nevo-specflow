import { describe, expect, it } from 'vitest';

import {
  absolutePathEntries,
  productCliGuard,
  productCliTrust,
  withAbsolutePath,
  type ProductCliFiles,
} from './cli-path';

/**
 * A fake file system. `links` maps a path (a directory or a file) to its real path; `files` holds
 * the real files, which a test may change mid-Turn; `dirs` the real directories. Any other path
 * does not exist.
 */
function fakeFiles(
  options: {
    links?: Record<string, string>;
    files?: Record<string, { size: number; mtimeMs: number; content: string }>;
    dirs?: readonly string[];
  } = {},
) {
  const links = { ...options.links };
  const files = { ...options.files };
  const dirs = new Set(options.dirs ?? []);
  const real = (path: string) => links[path] ?? path;
  const exists = (path: string) => dirs.has(real(path)) || files[real(path)] !== undefined;
  const seam: ProductCliFiles = {
    realpath: (path) =>
      exists(path) ? Promise.resolve(real(path)) : Promise.reject(new Error('ENOENT')),
    stat: (path) => {
      const file = files[real(path)];
      if (file) {
        return Promise.resolve({ isFile: () => true, size: file.size, mtimeMs: file.mtimeMs });
      }

      return dirs.has(real(path))
        ? Promise.resolve({ isFile: () => false, size: 0, mtimeMs: 0 })
        : Promise.reject(new Error('ENOENT'));
    },
    hash: (path) => {
      const file = files[real(path)];

      return file ? Promise.resolve('sha-of-' + file.content) : Promise.reject(new Error('ENOENT'));
    },
  };

  return { files, dirs, seam };
}

const cli = { size: 100, mtimeMs: 1, content: 'cli' };
const linux = { pathValue: '/usr/bin:/opt/bin', platform: 'linux', workspace: '/work' } as const;
const installed = () =>
  fakeFiles({ dirs: ['/usr/bin', '/opt/bin'], files: { '/opt/bin/nevo-specflow': cli } });

describe('the product CLI trust of an agent step execution Turn', () => {
  it.each(['/usr/bin:.', '/usr/bin::/bin', ':/usr/bin', '/usr/bin:./x', '/usr/bin:bin', ''])(
    'is not trusted when PATH has a relative or empty entry: %j',
    async (pathValue) => {
      expect(await productCliTrust({ ...linux, pathValue }, installed().seam)).toEqual({
        trusted: false,
        reason: 'PATH has a relative or empty entry.',
      });
    },
  );

  it('binds trust to the canonical identity of the executable PATH resolves', async () => {
    expect(await productCliTrust(linux, installed().seam)).toEqual({
      trusted: true,
      identity: { real: '/opt/bin/nevo-specflow', size: 100, mtimeMs: 1, sha256: 'sha-of-cli' },
    });
  });

  it('fails closed when no executable is found on PATH', async () => {
    const { seam } = fakeFiles({ dirs: ['/usr/bin', '/opt/bin'] });

    expect(await productCliTrust(linux, seam)).toEqual({
      trusted: false,
      reason: 'nevo-specflow was not found on PATH.',
    });
  });

  it('fails closed when the executable cannot be read', async () => {
    const { seam } = installed();
    const unreadable = { ...seam, hash: () => Promise.reject(new Error('EACCES')) };

    expect(await productCliTrust(linux, unreadable)).toMatchObject({ trusted: false });
  });

  it.each(['linux', 'win32'] as const)(
    'on %s is not trusted when a PATH entry lies inside the workspace (node_modules/.bin), case-folded on Windows',
    async (platform) => {
      const windows = platform === 'win32';
      const result = await productCliTrust(
        {
          pathValue: windows
            ? 'C:\\tools;C:\\Work\\node_modules\\.bin'
            : '/usr/bin:/work/node_modules/.bin',
          platform,
          workspace: windows ? 'C:\\work' : '/work',
        },
        fakeFiles().seam,
      );

      expect(result).toEqual({
        trusted: false,
        reason: expect.stringContaining('inside') as string,
      });
    },
  );

  it('is not trusted when a PATH directory is a link or junction into the workspace', async () => {
    const { seam } = fakeFiles({
      dirs: ['/usr/bin', '/work/bin'],
      links: { '/opt/bin': '/work/bin' },
      files: { '/work/bin/nevo-specflow': cli },
    });

    expect(await productCliTrust(linux, seam)).toEqual({
      trusted: false,
      reason: "A PATH entry lies inside the Turn's workspace.",
    });
  });

  it('is not trusted when the workspace itself is reached through a link', async () => {
    const { seam } = fakeFiles({
      dirs: ['/usr/bin', '/data/work', '/data/work/bin'],
      links: { '/work': '/data/work', '/opt/bin': '/data/work/bin' },
      files: { '/data/work/bin/nevo-specflow': cli },
    });

    expect(await productCliTrust(linux, seam)).toMatchObject({ trusted: false });
  });

  it('is not trusted when the executable resolves, through a link, into the workspace', async () => {
    const { seam } = fakeFiles({
      dirs: ['/usr/bin', '/opt/bin'],
      links: { '/opt/bin/nevo-specflow': '/work/planted/nevo-specflow' },
      files: { '/work/planted/nevo-specflow': cli },
    });

    expect(await productCliTrust(linux, seam)).toEqual({
      trusted: false,
      reason: 'nevo-specflow resolves to a file inside the workspace.',
    });
  });

  it('skips a PATH directory that does not exist', async () => {
    const { seam } = fakeFiles({ dirs: ['/opt/bin'], files: { '/opt/bin/nevo-specflow': cli } });

    expect(await productCliTrust(linux, seam)).toMatchObject({ trusted: true });
  });

  it('re-verifies at each decision: a file swapped mid-Turn is not trusted', async () => {
    const fs = installed();
    const check = productCliGuard(linux, fs.seam);
    expect(await check()).toMatchObject({ trusted: true });

    fs.files['/opt/bin/nevo-specflow'] = { ...cli, content: 'planted' };
    expect(await check()).toEqual({
      trusted: false,
      reason: 'nevo-specflow on PATH changed since the Turn started.',
    });
  });

  it('re-verifies at each decision: a PATH directory created ahead of the trusted one is not trusted', async () => {
    const fs = installed();
    fs.dirs.delete('/usr/bin');
    const check = productCliGuard(linux, fs.seam);
    expect(await check()).toMatchObject({ trusted: true });

    fs.dirs.add('/usr/bin');
    fs.files['/usr/bin/nevo-specflow'] = { ...cli, content: 'planted' };
    expect(await check()).toMatchObject({ trusted: false });
  });

  it('stays untrusted for the whole Turn when it was not trusted at its start', async () => {
    const fs = fakeFiles({ dirs: ['/usr/bin', '/opt/bin'] });
    const check = productCliGuard(linux, fs.seam);
    expect(await check()).toMatchObject({ trusted: false });

    fs.files['/opt/bin/nevo-specflow'] = cli;
    expect(await check()).toMatchObject({ trusted: false });
  });
});

it.each([
  ['linux', '/usr/bin:.::./x:bin:/opt/bin:', '/usr/bin:/opt/bin'],
  ['darwin', ':/usr/local/bin', '/usr/local/bin'],
  [
    'win32',
    'C:\\Windows;;.;tools;C:relative;"C:\\Program Files\\nodejs";D:/bin;',
    'C:\\Windows;C:\\Program Files\\nodejs;D:/bin',
  ],
] as const)(
  'drops empty and relative PATH entries on %s, so the launched shell can be trusted',
  async (platform, value, expected) => {
    expect(absolutePathEntries(value, platform)).toBe(expected);
    const directory = expected.split(platform === 'win32' ? ';' : ':')[0]!;
    const executable =
      platform === 'win32' ? directory + '\\nevo-specflow.cmd' : directory + '/nevo-specflow';
    const { seam } = fakeFiles({ dirs: [directory], files: { [executable]: cli } });
    expect(
      await productCliTrust(
        {
          pathValue: absolutePathEntries(value, platform),
          platform,
          workspace: platform === 'win32' ? 'C:\\work' : '/work',
        },
        seam,
      ),
    ).toMatchObject({ trusted: true });
  },
);

it('sanitizes PATH under any casing on Windows and only PATH on POSIX', () => {
  expect(withAbsolutePath({ Path: 'C:\\bin;', TEMP: '.' }, 'win32')).toEqual({
    Path: 'C:\\bin',
    TEMP: '.',
  });
  expect(withAbsolutePath({ PATH: '/bin::', Path: 'x' }, 'linux')).toEqual({
    PATH: '/bin',
    Path: 'x',
  });
});
