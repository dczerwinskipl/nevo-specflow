import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildThirdPartyNotices } from '../../packaging/notices.ts';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function packageDir(manifest: object, licenseText?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'nevo-notice-'));
  dirs.push(dir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest), 'utf8');
  if (licenseText) writeFileSync(join(dir, 'LICENSE'), licenseText, 'utf8');
  return dir;
}

describe('buildThirdPartyNotices', () => {
  it('reproduces an installed upstream license text verbatim', () => {
    const root = packageDir(
      { name: 'with-license', version: '1.2.3', license: 'MIT' },
      'VERBATIM LICENSE\nsecond line\n',
    );

    const notices = buildThirdPartyNotices([{ name: 'with-license', root }]);

    expect(notices).toContain('with-license 1.2.3 (MIT)');
    expect(notices).toContain('VERBATIM LICENSE\nsecond line');
  });

  it('preserves manifest attribution when upstream ships no license file', () => {
    const root = packageDir({
      name: 'metadata-only',
      version: '2.0.1',
      license: 'MIT',
      author: 'Example Author <author@example.test>',
      repository: { url: 'git+https://example.test/metadata-only.git' },
    });

    const notices = buildThirdPartyNotices([{ name: 'metadata-only', root }]);

    expect(notices).toContain('metadata-only 2.0.1 (MIT)');
    expect(notices).toContain('Author: Example Author <author@example.test>');
    expect(notices).toContain('git+https://example.test/metadata-only.git');
    expect(notices).toContain('package.json declares the license as: MIT');
  });

  it('fails closed when a bundled package exposes no license information', () => {
    const root = packageDir({ name: 'unknown-license', version: '1.0.0' });

    expect(() => buildThirdPartyNotices([{ name: 'unknown-license', root }])).toThrow(
      /neither a LICENSE file nor package\.json license metadata/,
    );
  });
});
