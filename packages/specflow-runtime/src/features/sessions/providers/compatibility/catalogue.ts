import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';

const closed = { additionalProperties: false } as const;
const label = Type.String({ minLength: 1, maxLength: 128 });
export const CompatibilityRecordSchema = Type.Object(
  {
    providerId: label,
    platform: Type.Union([Type.Literal('win32'), Type.Literal('linux'), Type.Literal('darwin')]),
    architecture: Type.Union([Type.Literal('x64'), Type.Literal('arm64')]),
    version: label,
    sha256: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    protocolProfile: label,
    classification: Type.Union([Type.Literal('verified'), Type.Literal('unsupported')]),
    capabilities: Type.Array(label, { maxItems: 32, uniqueItems: true }),
    authenticationModes: Type.Array(label, { maxItems: 8, uniqueItems: true }),
    executionModes: Type.Array(Type.Literal('read-only'), { maxItems: 1, uniqueItems: true }),
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
  classification: 'verified',
  capabilities: Object.freeze(['initialization', 'restricted-read-tools', 'questions']),
  authenticationModes: Object.freeze(['personal-pro-max-oauth-file']),
  executionModes: Object.freeze(['read-only'] as const),
  evidenceId: 'claude-2.1.296-windows-readonly-policy',
  revoked: false,
});

/** Schema validation is not signature verification and never confers catalogue trust. */
export function validCompatibilityRecord(value: unknown): value is CompatibilityRecord {
  return (
    Value.Check(CompatibilityRecordSchema, value) &&
    !(value.classification === 'verified' && value.revoked)
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
  | { classification: 'verified'; record: ImmutableRecord }
  | { classification: 'provisional' | 'unsupported'; reason: string };

/** Only the bundled trusted baseline is admitted until signed distribution is implemented. */
export function classifyProviderInstallation(
  installation: ProviderInstallationIdentity,
  trustedRecords: readonly ImmutableRecord[] = [bundledClaudeBuild],
): ProviderCompatibility {
  const matching = trustedRecords.filter(
    (record) =>
      record.providerId === installation.providerId &&
      record.platform === installation.platform &&
      record.architecture === installation.architecture &&
      record.sha256 === installation.sha256,
  );
  if (matching.length > 1 || matching.some((record) => !validCompatibilityRecord(record)))
    return { classification: 'unsupported', reason: 'Compatibility evidence is invalid.' };
  const record = matching[0];
  if (record) {
    if (
      record.revoked ||
      record.classification !== 'verified' ||
      record.protocolProfile !== 'claude-stream-json-v1' ||
      (installation.version !== undefined && installation.version !== record.version)
    )
      return {
        classification: 'unsupported',
        reason: 'Provider build is revoked or incompatible.',
      };
    return { classification: 'verified', record };
  }
  const candidate =
    installation.providerId === 'claude' &&
    installation.platform === 'win32' &&
    installation.architecture === 'x64' &&
    /^2\.1\.\d+$/.test(installation.version ?? '');
  return candidate
    ? {
        classification: 'provisional',
        reason: 'Provider build needs trusted safety certification.',
      }
    : { classification: 'unsupported', reason: 'Provider installation identity is not certified.' };
}
