import { describe, expect, it } from 'vitest';

import {
  assertLocalAuthenticationSource,
  assertProjectAuthenticationSource,
} from './source-policy';

describe('authentication config ownership', () => {
  it('rejects local OIDC secrets from project configuration', () => {
    expect(() =>
      assertProjectAuthenticationSource({
        mode: 'required',
        providers: {
          password: { enabled: false },
          oidc: {
            instances: {
              company: {
                name: 'Company SSO',
                enabled: false,
                clientSecret: 'committed-secret',
              },
            },
          },
        },
      }),
    ).toThrowError(
      /Unknown configuration key 'authentication\.providers\.oidc\.instances\.company\.clientSecret'/,
    );
  });

  it('rejects project policy from local configuration', () => {
    expect(() =>
      assertLocalAuthenticationSource({
        mode: 'required',
      }),
    ).toThrowError(/Unknown configuration key 'authentication\.mode'/);
  });
});
