import { expect, it } from 'vitest';
import { admitProvider } from './admission';
import {
  bundledClaudeBuild,
  classifyProviderInstallation,
  validCompatibilityRecord,
} from './catalogue';

const installation = { ...bundledClaudeBuild };
const prerequisites = {
  configured: true,
  authenticated: true,
  securityVerified: true,
  executionMode: 'read-only',
};

it('admits the trusted bundled fingerprint only with independent security/authentication gates', () => {
  const compatibility = classifyProviderInstallation(installation);
  expect(compatibility.classification).toBe('verified');
  expect(admitProvider(compatibility, prerequisites).allowed).toBe(true);
  for (const gate of ['configured', 'authenticated', 'securityVerified'] as const)
    expect(admitProvider(compatibility, { ...prerequisites, [gate]: false }).allowed).toBe(false);
  expect(
    admitProvider(compatibility, { ...prerequisites, executionMode: 'writable' }).allowed,
  ).toBe(false);
});

it.each(['2.1.296', '2.1.297'])(
  'never executes an uncertified %s build despite plausible protocol compatibility',
  (version) => {
    const compatibility = classifyProviderInstallation({
      ...installation,
      version,
      sha256: 'a'.repeat(64),
    });
    expect(compatibility.classification).toBe('provisional');
    expect(admitProvider(compatibility, prerequisites).allowed).toBe(false);
  },
);

it('rejects revoked, unknown profile/platform and mismatched version evidence', () => {
  const revoked = { ...bundledClaudeBuild, revoked: true, classification: 'unsupported' as const };
  expect(classifyProviderInstallation(installation, [revoked]).classification).toBe('unsupported');
  const changedProfile = { ...bundledClaudeBuild, protocolProfile: 'unimplemented-v2' };
  expect(classifyProviderInstallation(installation, [changedProfile]).classification).toBe(
    'unsupported',
  );
  expect(classifyProviderInstallation({ ...installation, version: '2.1.999' }).classification).toBe(
    'unsupported',
  );
  expect(classifyProviderInstallation({ ...installation, platform: 'linux' }).classification).toBe(
    'unsupported',
  );
});

it('validates closed evidence records without granting external metadata trust', () => {
  expect(validCompatibilityRecord(bundledClaudeBuild)).toBe(true);
  expect(validCompatibilityRecord({ ...bundledClaudeBuild, command: '--unsafe' })).toBe(false);
  expect(validCompatibilityRecord({ ...bundledClaudeBuild, revoked: true })).toBe(false);
  expect(validCompatibilityRecord({ ...bundledClaudeBuild, sha256: 'not-a-fingerprint' })).toBe(
    false,
  );
  expect(
    classifyProviderInstallation(installation, [bundledClaudeBuild, bundledClaudeBuild])
      .classification,
  ).toBe('unsupported');
});
