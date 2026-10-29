import { describe, expect, it } from 'vitest';
import { polishText } from '../../../../i18n/testing';
import { providerStatus as rawProviderStatus } from './providerStatus';

// The status carries catalogue messages; these tests assert the Polish text they render to.
function providerStatus(...args: Parameters<typeof rawProviderStatus>) {
  const status = rawProviderStatus(...args);

  return {
    ...status,
    access: polishText(status.access),
    availability: polishText(status.availability),
  };
}

const base = { available: true, connection: 'unknown' } as const;

describe('providerStatus', () => {
  it('maps a known connection to an access statement and never mentions the demo profile', () => {
    expect(providerStatus({ ...base, connection: 'api' }, { demo: true }).access).toBe('API');
    expect(providerStatus({ ...base, connection: 'subscription' }, { demo: true }).access).toBe(
      'Subskrypcja',
    );
  });
  it('shows no access line when the connection is unknown or absent (no filler)', () => {
    expect(providerStatus(base, { demo: true }).access).toBeUndefined();
    expect(providerStatus({ available: true }, { demo: true }).access).toBeUndefined();
  });
  it('states the demo only for a demo catalogue', () => {
    expect(providerStatus(base, { demo: true })).toMatchObject({
      availability: 'Dostępny w demo',
      tone: 'info',
    });
    expect(providerStatus(base, { demo: false } as never)).toMatchObject({
      availability: 'Dostępny',
      tone: 'success',
    });
  });
  it('never reports an unknown quota', () => {
    const status = providerStatus({ ...base, quota: { state: 'unknown' } } as never, {
      demo: true,
    });
    expect(JSON.stringify(status)).not.toMatch(/Limit|nieznany/);
  });
  it('shows the reason of an unavailable provider without access or indicator', () => {
    expect(
      providerStatus(
        { ...base, connection: 'api', available: false, reason: 'Brak adaptera' },
        { demo: true },
      ),
    ).toMatchObject({ availability: 'Brak adaptera', tone: undefined, access: undefined });
    expect(providerStatus({ ...base, available: false }, { demo: true }).availability).toBe(
      'Niedostępny w tym środowisku',
    );
  });
  it('keeps an available provider reason as a separate note', () => {
    expect(providerStatus({ ...base, reason: ' Ograniczone ' }, { demo: true }).note).toBe(
      'Ograniczone',
    );
  });
});
