import { describe, expect, it } from 'vitest';
import { statusTones, type StatusTone } from './statusTone';

describe('StatusTone', () => {
  it('keeps one semantic vocabulary for status components', () => {
    const tones: readonly StatusTone[] = ['neutral', 'info', 'success', 'attention', 'danger'];

    expect(statusTones).toEqual(tones);
  });
});

