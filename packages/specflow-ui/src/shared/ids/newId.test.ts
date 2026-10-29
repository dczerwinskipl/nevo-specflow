import { describe, expect, it } from 'vitest';
import { newId } from './newId';

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newId', () => {
  it('uses randomUUID when the context provides it', () => {
    expect(
      newId({
        randomUUID: () => '00000000-0000-4000-8000-000000000000',
        getRandomValues: crypto.getRandomValues.bind(crypto),
      }),
    ).toBe('00000000-0000-4000-8000-000000000000');
  });

  it('falls back to getRandomValues where randomUUID is missing (non-secure context)', () => {
    const ids = new Set(
      Array.from({ length: 50 }, () =>
        newId({ getRandomValues: crypto.getRandomValues.bind(crypto) }),
      ),
    );
    expect(ids.size).toBe(50);
    for (const id of ids) {
      expect(id).toMatch(uuidV4);
    }
  });
});
