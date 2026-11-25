import { expect, it } from 'vitest';

import { absolutePathEntries, productCliTrust, withAbsolutePath } from './cli-path';

const trust = (input: Parameters<typeof productCliTrust>[0]) => productCliTrust(input).trusted;

it.each(['/usr/bin:.', '/usr/bin::/bin', ':/usr/bin', '/usr/bin:./x', '/usr/bin:bin'])(
  'does not trust the product CLI when PATH has a relative or empty entry: %j',
  (pathValue) => expect(trust({ pathValue, platform: 'linux', workspace: '/work' })).toBe(false),
);

it('trusts an absolute PATH outside the workspace', () => {
  expect(trust({ pathValue: '/usr/bin:/opt/bin', platform: 'linux', workspace: '/work' })).toBe(
    true,
  );
});

it.each(['linux', 'win32'] as const)(
  'on %s does not trust a PATH entry inside the workspace (node_modules/.bin), naming why',
  (platform) => {
    const windows = platform === 'win32';
    const result = productCliTrust({
      pathValue: windows
        ? 'C:\\tools;C:\\Work\\node_modules\\.bin'
        : '/usr/bin:/work/node_modules/.bin',
      platform,
      workspace: windows ? 'C:\\work' : '/work',
    });

    expect(result).toEqual({ trusted: false, reason: expect.stringContaining('inside') as string });
  },
);

it('does not trust a product CLI that resolves, through a link, into the workspace', () => {
  const input = { pathValue: '/opt/bin', platform: 'linux', workspace: '/work' } as const;

  expect(
    productCliTrust({
      ...input,
      exists: (path) => path === '/opt/bin/nevo-specflow',
      real: () => '/work/planted/nevo-specflow',
    }).trusted,
  ).toBe(false);
  expect(
    productCliTrust({
      ...input,
      exists: (path) => path === '/opt/bin/nevo-specflow',
      real: (p) => p,
    }).trusted,
  ).toBe(true);
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
  (platform, value, expected) => {
    expect(absolutePathEntries(value, platform)).toBe(expected);
    expect(
      trust({
        pathValue: absolutePathEntries(value, platform),
        platform,
        workspace: platform === 'win32' ? 'C:\\work' : '/work',
        exists: () => false,
      }),
    ).toBe(true);
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
