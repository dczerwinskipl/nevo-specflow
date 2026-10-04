import { describe, expect, it } from 'vitest';

import { sanitizeRequestUrl } from '../../src/server/logging';

describe('Runtime request logging', () => {
  it('never includes query or fragment data in the logged request path', () => {
    expect(
      sanitizeRequestUrl('/api/auth/oidc/company/callback?code=secret-code&state=secret-state'),
    ).toBe('/api/auth/oidc/company/callback');
    expect(sanitizeRequestUrl('/path?token=secret#fragment')).toBe('/path');
    expect(sanitizeRequestUrl('/plain/path')).toBe('/plain/path');
  });
});
