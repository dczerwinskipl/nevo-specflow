import { describe, expect, it } from 'vitest';
import { createSpecFlowI18n } from '../../../i18n';
import { outcomeCause } from './outcomeReason';

describe('outcome cause', () => {
  it('words a known failure reason itself, in the reader language, before any notice', () => {
    const error = {
      code: 'PROVIDER_FAILED',
      message: "SpecFlow could not check Claude's settings on this computer (the check timed out).",
      reason: 'claude-policy-check-failed',
    };
    expect(outcomeCause('failed', error, ['Raw notice.'], createSpecFlowI18n('pl').t)).toBe(
      'SpecFlow nie mógł sprawdzić ustawień Claude na tym komputerze. Spróbuj ponownie; jeśli to się powtarza, uruchom Runtime ponownie.',
    );
  });

  it("says SpecFlow's own notice of the Turn as the actual cause, before the error code", () => {
    const t = createSpecFlowI18n('en').t;
    const error = { code: 'PROCESS_STOPPED', message: 'The agent process stopped.' };
    expect(outcomeCause('interrupted', error, ['SpecFlow stopped Claude.'], t)).toBe(
      'SpecFlow stopped Claude.',
    );
    expect(outcomeCause('interrupted', error, [], t)).toBe(
      t('managedSession.outcomeReason.PROCESS_STOPPED'),
    );
  });

  it("falls back to the Runtime's message, then to the outcome in plain words", () => {
    const t = createSpecFlowI18n('en').t;
    expect(
      outcomeCause('failed', { code: 'PROVIDER_FAILED', message: 'Something new.' }, [], t),
    ).toBe('Something new.');
    expect(outcomeCause('cancelled', undefined, [], t)).toBe(
      t('managedSession.outcomeReason.cancelled'),
    );
  });
});
