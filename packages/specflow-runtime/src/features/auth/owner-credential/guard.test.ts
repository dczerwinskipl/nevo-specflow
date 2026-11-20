import { describe, expect, it } from 'vitest';

import { requiresOwnerCredential } from './guard';

describe('owner route classification (D21)', () => {
  it.each([
    ['POST', '/api/specs/:specId/workflow/finish', undefined, true],
    ['POST', '/api/specs/:specId/tasks/:taskId/workflow/return', undefined, true],
    ['PUT', '/api/specs/:specId/documents/:documentId', undefined, true],
    ['PATCH', '/api/sessions/:sessionId', undefined, true],
    ['DELETE', '/api/auth/devices/:id', undefined, true],
    ['POST', '/api/auth/pairing/approve', undefined, true],
    ['post', '/api/authorization/capabilities', undefined, true],
    ['POST', '/api/auth/pairing', 'pairing request', false],
    ['POST', '/api/auth/pairing/redeem', 'redeem', false],
    ['POST', '/api/auth/password/login', 'login', false],
    ['GET', '/api/specs/:specId/workflow/actions', undefined, false],
    ['HEAD', '/api/specs', undefined, false],
    ['OPTIONS', '/api/specs', undefined, false],
    ['POST', '/', undefined, false],
    ['POST', undefined, undefined, false],
  ] as const)('%s %s (exempt: %s) needs a credential: %s', (method, url, exempt, expected) => {
    expect(
      requiresOwnerCredential({
        method,
        url,
        ...(exempt ? { config: { ownerCredentialExempt: exempt } } : {}),
      }),
    ).toBe(expected);
  });
});
