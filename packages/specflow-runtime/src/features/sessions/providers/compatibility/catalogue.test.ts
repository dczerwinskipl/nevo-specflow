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
  executionPolicyChecked: true,
  protocolVerified: true,
  executionMode: 'read-only',
};

it.each(['2.0.0', '2.1.0', '2.2.0', '2.3.17'])(
  'does not require a catalogue update or certificate for compatible Antigravity %s',
  (version) => {
    const compatibility = classifyProviderInstallation(
      {
        providerId: 'antigravity',
        platform: 'win32',
        architecture: 'x64',
        version,
        sha256: 'f'.repeat(64),
      },
      [],
    );
    expect(compatibility.classification).toBe('provisional');
    expect(
      admitProvider(compatibility, {
        ...prerequisites,
        executionMode: 'workspace-write',
        managedEffectsAvailable: true,
      }).allowed,
    ).toBe(true);
  },
);

it('classifies Antigravity without granting execution before its independent gates', () => {
  const compatibility = classifyProviderInstallation({
    providerId: 'antigravity',
    platform: 'win32',
    architecture: 'x64',
    sha256: 'b'.repeat(64),
  });
  expect(compatibility.classification).toBe('provisional');
  expect(
    admitProvider(compatibility, { ...prerequisites, executionPolicyChecked: false }).allowed,
  ).toBe(false);
  expect(
    admitProvider(compatibility, {
      ...prerequisites,
      executionMode: 'workspace-write',
      managedEffectsAvailable: false,
    }).allowed,
  ).toBe(false);
  expect(
    classifyProviderInstallation({ ...installation, providerId: 'toString' }).classification,
  ).toBe('unsupported');
});

it('admits the trusted bundled fingerprint only with independent security/authentication gates', () => {
  const compatibility = classifyProviderInstallation(installation);
  expect(compatibility.classification).toBe('tested');
  expect(admitProvider(compatibility, prerequisites).allowed).toBe(true);
  for (const gate of [
    'configured',
    'authenticated',
    'executionPolicyChecked',
    'protocolVerified',
  ] as const) {
    expect(admitProvider(compatibility, { ...prerequisites, [gate]: false }).allowed).toBe(false);
  }

  expect(
    admitProvider(compatibility, { ...prerequisites, executionMode: 'writable' }).allowed,
  ).toBe(false);
});

it.each(['2.1.296', '2.1.297', '9.0.0'])(
  'admits unlisted %s builds only after protocol and execution checks',
  (version) => {
    const compatibility = classifyProviderInstallation({
      ...installation,
      version,
      sha256: 'a'.repeat(64),
    });
    expect(compatibility.classification).toBe('provisional');
    expect(admitProvider(compatibility, prerequisites).allowed).toBe(true);
  },
);

it('rejects revoked, unknown profile/platform and mismatched version evidence', () => {
  const revoked = { ...bundledClaudeBuild, revoked: true, classification: 'unsupported' as const };
  expect(classifyProviderInstallation(installation, [revoked]).classification).toBe('unsupported');
  const changedProfile = { ...bundledClaudeBuild, protocolProfile: 'unimplemented-v2' };
  expect(classifyProviderInstallation(installation, [changedProfile]).classification).toBe(
    'provisional',
  );
  expect(classifyProviderInstallation({ ...installation, version: '2.1.999' }).classification).toBe(
    'provisional',
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
  ).toBe('provisional');
});

it('does not turn broken diagnostic certification metadata into a denylist', () => {
  const invalidCertificate = { ...bundledClaudeBuild, command: 'not-executable-metadata' };
  const compatibility = classifyProviderInstallation(installation, [invalidCertificate]);
  expect(compatibility.classification).toBe('provisional');
  expect(admitProvider(compatibility, prerequisites).allowed).toBe(true);
  const knownBroken = {
    ...bundledClaudeBuild,
    classification: 'unsupported' as const,
    revoked: true,
  };
  expect(
    classifyProviderInstallation(installation, [invalidCertificate, knownBroken]).classification,
  ).toBe('unsupported');
});
