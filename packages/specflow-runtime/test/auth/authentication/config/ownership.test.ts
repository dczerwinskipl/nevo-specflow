import { describe, expect, it } from 'vitest';

import {
  assertLocalAuthConfigOwnership,
  assertProjectAuthConfigOwnership,
} from '../../../../src/auth/authentication/config/ownership';

describe('authentication config ownership', () => {
  it('rejects local secrets from project configuration', () => {
    expect(() =>
      assertProjectAuthConfigOwnership({
        mode: 'required',
        providers: {
          password: { enabled: false },
          oidc: {
            enabled: false,
            clientSecret: 'committed-secret',
          },
        },
      }),
    ).toThrowError(/Unknown configuration key 'auth\.providers\.oidc\.clientSecret'/);
  });

  it('rejects project policy from local configuration', () => {
    expect(() =>
      assertLocalAuthConfigOwnership({
        mode: 'required',
      }),
    ).toThrowError(/Unknown configuration key 'auth\.mode'/);
  });
});
