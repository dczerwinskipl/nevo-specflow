import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';

const closed = { additionalProperties: false } as const;
const label = Type.String({ minLength: 1, maxLength: 128 });
const protocolProfiles = new Map([
  ['claude', 'claude-stream-json-v1'],
  ['codex', 'codex-app-server-v2'],
  ['antigravity', 'antigravity-stream-json-v1'],
]);
export const CompatibilityRecordSchema = Type.Object(
  {
    providerId: label,
    platform: Type.Union([Type.Literal('win32'), Type.Literal('linux'), Type.Literal('darwin')]),
    architecture: Type.Union([Type.Literal('x64'), Type.Literal('arm64')]),
    version: label,
    sha256: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    protocolProfile: label,
    classification: Type.Union([Type.Literal('tested'), Type.Literal('unsupported')]),
    capabilities: Type.Array(label, { maxItems: 32, uniqueItems: true }),
    authenticationModes: Type.Array(label, { maxItems: 8, uniqueItems: true }),
    executionModes: Type.Array(
      Type.Union([Type.Literal('read-only'), Type.Literal('workspace-write')]),
      { maxItems: 2, uniqueItems: true },
    ),
    evidenceId: label,
    revoked: Type.Boolean(),
  },
  closed,
);
export type CompatibilityRecord = Static<typeof CompatibilityRecordSchema>;
type ImmutableRecord = {
  readonly [Key in keyof CompatibilityRecord]: CompatibilityRecord[Key] extends (infer Item)[]
    ? readonly Item[]
    : CompatibilityRecord[Key];
};

// Trusted by the product release. There is deliberately no configuration/HTTP input here.
export const bundledClaudeBuild: ImmutableRecord = Object.freeze({
  providerId: 'claude',
  platform: 'win32',
  architecture: 'x64',
  version: '2.1.296',
  sha256: '76de74f7694a5bdc03378a5f837c9e132827bf004c98c276bc4e9094ff06769a',
  protocolProfile: 'claude-stream-json-v1',
  classification: 'tested',
  capabilities: Object.freeze(['initialization', 'restricted-read-tools', 'questions']),
  authenticationModes: Object.freeze(['personal-pro-max-oauth-file']),
  executionModes: Object.freeze(['read-only'] as const),
  evidenceId: 'claude-2.1.296-windows-readonly-policy',
  revoked: false,
});

/** Validate local diagnostic/known-incompatibility records; absence is never a denial. */
export function validCompatibilityRecord(value: unknown): value is CompatibilityRecord {
  return (
    Value.Check(CompatibilityRecordSchema, value) &&
    !(value.classification === 'tested' && value.revoked)
  );
}

export interface ProviderInstallationIdentity {
  providerId: string;
  platform: string;
  architecture: string;
  version?: string;
  sha256: string;
}

export type ProviderCompatibility =
  | { classification: 'tested'; record: ImmutableRecord }
  | { classification: 'provisional' | 'unsupported'; reason: string };

export function compatibilityForExecution(
  compatibility: ProviderCompatibility,
  mode: 'read-only' | 'workspace-write',
): ProviderCompatibility {
  return compatibility.classification === 'tested' &&
    !compatibility.record.executionModes.includes(mode)
    ? {
        classification: 'provisional',
        reason: 'This execution mode has no tested evidence for the build.',
      }
    : compatibility;
}

/** Tested is diagnostic evidence. Every other compatible installation may be provisional. */
export function classifyProviderInstallation(
  installation: ProviderInstallationIdentity,
  trustedRecords: readonly ImmutableRecord[] = [bundledClaudeBuild],
): ProviderCompatibility {
  const profile = protocolProfiles.get(installation.providerId);
  if (!profile || installation.platform !== 'win32' || installation.architecture !== 'x64') {
    return {
      classification: 'unsupported',
      reason: 'Provider platform/profile is not implemented.',
    };
  }

  const matching = trustedRecords.filter(
    (record) =>
      record.providerId === installation.providerId &&
      record.platform === installation.platform &&
      record.architecture === installation.architecture &&
      record.sha256 === installation.sha256,
  );
  if (matching.length > 1 || matching.some((record) => !validCompatibilityRecord(record))) {
    return { classification: 'unsupported', reason: 'Compatibility evidence is invalid.' };
  }

  const record = matching[0];
  if (record) {
    if (
      record.revoked ||
      record.classification !== 'tested' ||
      record.protocolProfile !== profile
    ) {
      return {
        classification: 'unsupported',
        reason: 'Provider build is revoked or incompatible.',
      };
    }

    if (installation.version === record.version) {
      return { classification: 'tested', record };
    }

    return {
      classification: 'provisional',
      reason: 'Provider version was not established by the handshake.',
    };
  }

  return {
    classification: 'provisional',
    reason: 'Local protocol and execution checks are required.',
  };
}
