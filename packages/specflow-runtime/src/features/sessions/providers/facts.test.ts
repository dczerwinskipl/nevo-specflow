import { describe, expect, it } from 'vitest';
import type { DriverFact } from '../persistence/protocol';
import { validateDriverFact } from './facts';

describe('provider fact boundary', () => {
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
