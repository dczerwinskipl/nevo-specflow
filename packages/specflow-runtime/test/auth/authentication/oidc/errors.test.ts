import { ClientError } from 'openid-client';
import { describe, expect, it } from 'vitest';

import { classifyOidcGrantError } from '../../../../src/auth/authentication/oidc/errors';

describe('OIDC provider error classification', () => {
  it('distinguishes protocol validation from provider availability failures', () => {
    const authentication = classifyOidcGrantError(clientError('OAUTH_JWT_CLAIM_COMPARISON_FAILED'));
    expect(authentication?.kind).toBe('authentication');
    expect(authentication?.diagnostic).toMatchObject({
      category: 'client_validation',
      code: 'OAUTH_JWT_CLAIM_COMPARISON_FAILED',
    });

    const unavailable = classifyOidcGrantError(clientError('OAUTH_TIMEOUT'));
    expect(unavailable?.kind).toBe('unavailable');
    expect(unavailable?.diagnostic).toMatchObject({
      category: 'client_validation',
      code: 'OAUTH_TIMEOUT',
    });
  });

  it('treats network TypeError as availability failure but preserves programmer argument errors', () => {
    const network = classifyOidcGrantError(new TypeError('fetch failed'));
    expect(network?.kind).toBe('unavailable');
    expect(network?.diagnostic).toMatchObject({ category: 'network' });

    expect(
      classifyOidcGrantError(
        Object.assign(new TypeError('bad adapter argument'), { code: 'ERR_INVALID_ARG_TYPE' }),
      ),
    ).toBeNull();
  });
});

function clientError(code: string): ClientError {
  const error = new ClientError(`openid-client error: ${code}`);
  error.code = code;
  return error;
}
