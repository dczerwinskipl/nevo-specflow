import { expect, it } from 'vitest';
import { createProviderAuthentication } from './authentication';

it('bounds old rejection evidence without evicting a rejected current login', () => {
  const authentication = createProviderAuthentication();
  authentication.verified('current');
  expect(authentication.reject('current')).toBe(true);
  for (let i = 0; i < 100; i++) {
    expect(authentication.reject('stale-' + i)).toBe(false);
  }

  expect(authentication.isRejected('current')).toBe(true);
  expect(authentication.isRejected('stale-0')).toBe(false);
  expect(authentication.isRejected('stale-99')).toBe(true);
});
