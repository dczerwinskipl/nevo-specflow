import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';
import { ProviderDescriptorSchema } from './commands';
import { sessionValidators } from './validation';

it.each(['tested', 'provisional', 'unsupported'])(
  'exposes bounded provider compatibility: %s',
  (classification) => {
    const descriptor = {
      providerId: 'claude',
      title: 'Claude Code',
      readiness: 'ready',
      capabilities: {
        questions: true,
        permissions: false,
        cancel: true,
        resume: true,
        modelOverride: true,
        effortOverride: true,
      },
      models: [],
      modes: ['read-only'],
      compatibility: { classification, protocolProfile: 'claude-stream-json-v1', version: '9.0.0' },
    };
    expect(Value.Check(ProviderDescriptorSchema, descriptor)).toBe(true);
    expect(
      Value.Check(ProviderDescriptorSchema, { ...descriptor, reasonCode: 'PROTOCOL_UNSUPPORTED' }),
    ).toBe(true);
    expect(
      Value.Check(ProviderDescriptorSchema, {
        ...descriptor,
        reasonCode: 'arbitrary-native-error',
      }),
    ).toBe(false);
    expect(
      Value.Check(ProviderDescriptorSchema, {
        ...descriptor,
        compatibility: { ...descriptor.compatibility, account: 'private' },
      }),
    ).toBe(false);
    expect(
      Value.Check(ProviderDescriptorSchema, {
        ...descriptor,
        compatibility: { ...descriptor.compatibility, classification: 'probably-tested' },
      }),
    ).toBe(false);
  },
);

describe('command result schemas', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const other = '00000000-0000-4000-8000-000000000002';

  it.each([
    ['createResult', { sessionId: id }],
    ['startResult', { turnId: id }],
    ['cancelResult', { turnId: id }],
    ['respondResult', { turnId: id, interactionId: other }],
    ['reconcileResult', { turnId: id, outcome: 'completed', reconciled: true }],
  ] as const)('%s accepts its closed shape and rejects extra keys', (name, value) => {
    const check = sessionValidators[name];
    expect(check(value)).toBe(true);
    expect(check({ ...value, extra: 1 })).toBe(false);
    expect(check({})).toBe(false);
  });

  it('rejects ids that are not Session ids', () => {
    expect(sessionValidators.startResult({ turnId: 'turn-1' })).toBe(false);
  });

  it('types the reconcile outcome as a Turn outcome', () => {
    for (const outcome of ['completed', 'failed', 'cancelled', 'interrupted']) {
      expect(sessionValidators.reconcileResult({ turnId: id, outcome, reconciled: false })).toBe(
        true,
      );
    }

    expect(
      sessionValidators.reconcileResult({ turnId: id, outcome: 'unknown', reconciled: true }),
    ).toBe(false);
  });
});
