import { Value } from 'typebox/value';
import { expect, it } from 'vitest';
import { ProviderDescriptorSchema } from './commands';

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
