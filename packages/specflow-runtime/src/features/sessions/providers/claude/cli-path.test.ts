import { expect, it } from 'vitest';

import { productCliTrusted } from './cli-path';

it.each(['/usr/bin:.', '/usr/bin::/bin', ':/usr/bin', '/usr/bin:./x', '/usr/bin:bin'])(
  'does not trust the product CLI when PATH has a relative or empty entry: %j',
  (pathValue) =>
    expect(productCliTrusted({ pathValue, platform: 'linux', workspace: '/work' })).toBe(false),
);

it('trusts an absolute PATH on POSIX', () => {
  expect(
    productCliTrusted({ pathValue: '/usr/bin:/opt/bin', platform: 'linux', workspace: '/work' }),
  ).toBe(true);
});

it('on Windows does not trust a product CLI that resolves inside the workspace', () => {
  const input = {
    pathValue: 'C:\\work\\bin;C:\\tools',
    platform: 'win32',
    workspace: 'C:\\Work',
  } as const;

  expect(
    productCliTrusted({
      ...input,
      exists: (path) => path.toLowerCase() === 'c:\\work\\bin\\nevo-specflow.cmd',
    }),
  ).toBe(false);
  expect(
    productCliTrusted({ ...input, exists: (path) => path === 'C:\\tools\\nevo-specflow.cmd' }),
  ).toBe(true);
});
