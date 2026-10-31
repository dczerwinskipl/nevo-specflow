import { describe, expect, it } from 'vitest';
import type { DriverFact } from '../persistence/protocol';
import { validateDriverFact } from './facts';

describe('provider fact boundary', () => {
  it('validates measurement precision, disjoint context breakdown and private-field exclusion', () => {
    const cost = {
      kind: 'measurement',
      metric: 'cost',
      sampleId: 'native-cost',
      basis: 'turn-total',
      value: {
        currency: 'USD',
        amount: '0.123456789012',
        basis: 'provider-reported',
        meaning: 'api-equivalent',
      },
    };
    expect(() => validateDriverFact(cost as DriverFact)).not.toThrow();
    for (const amount of ['1e-3', '-1', '0.1234567890123', 'NaN']) {
      expect(() =>
        validateDriverFact({ ...cost, value: { ...cost.value, amount } } as DriverFact),
      ).toThrow();
    }

    expect(() =>
      validateDriverFact({
        kind: 'measurement',
        metric: 'context',
        sampleId: 'context',
        value: {
          contextGeneration: 'opaque',
          occupiedTokens: 5,
          breakdown: { coverage: 'partial', components: [{ kind: 'instructions', tokens: 6 }] },
        },
      }),
    ).toThrow();
    expect(() =>
      validateDriverFact({ ...cost, privateAccount: 'secret' } as unknown as DriverFact),
    ).toThrow();
  });
  it('enforces bytes rather than UTF-16 length and rejects extra provider fields', () => {
    expect(() =>
      validateDriverFact({
        kind: 'text',
        key: 'answer',
        channel: 'answer',
        text: '💬'.repeat(4096),
      }),
    ).not.toThrow();
    expect(() =>
      validateDriverFact({
        kind: 'text',
        key: 'answer',
        channel: 'answer',
        text: '💬'.repeat(4097),
      }),
    ).toThrow('byte budget');
    expect(() =>
      validateDriverFact({
        kind: 'lost',
        message: 'lost',
        privateCredential: 'secret',
      } as unknown as DriverFact),
    ).toThrow('protocol');
  });
  it('rejects ambiguous question options', () => {
    expect(() =>
      validateDriverFact({
        kind: 'interaction',
        key: 'q',
        interaction: {
          kind: 'question',
          prompt: 'Choose',
          allowText: false,
          options: [
            { id: 'same', label: 'A' },
            { id: 'same', label: 'B' },
          ],
        },
      }),
    ).toThrow('Duplicate');
  });
});
