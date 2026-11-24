import { describe, expect, it } from 'vitest';
import { createSpecFlowI18n } from '../../../i18n';
import { outcomeReason } from './outcomeReason';

describe('outcome reason', () => {
  it('words a known failure reason itself, in the reader language', () => {
    const error = {
      code: 'PROVIDER_FAILED',
      message: "SpecFlow could not check Claude's settings on this computer (the check timed out).",
      reason: 'claude-policy-check-failed',
    };
    expect(outcomeReason(error, createSpecFlowI18n('pl').t)).toBe(
      'SpecFlow nie mógł sprawdzić ustawień Claude na tym komputerze. Spróbuj ponownie; jeśli to się powtarza, uruchom Runtime ponownie.',
    );
  });

  it("falls back to the Runtime's message for a reason it does not know", () => {
    const t = createSpecFlowI18n('en').t;
    expect(
      outcomeReason({ code: 'PROVIDER_FAILED', message: 'Something new.', reason: 'new' }, t),
    ).toBe('Something new.');
    expect(outcomeReason({ code: 'PROVIDER_FAILED', message: 'No reason.' }, t)).toBeUndefined();
  });
});
