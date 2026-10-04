import { describe, expect, it } from 'vitest';

import { isRuntimeOwnOrigin } from '../../src/server/origin';

describe('Runtime origin comparison', () => {
  it('treats equivalent loopback hosts as the same HTTP Runtime origin', () => {
    expect(
      isRuntimeOwnOrigin(
        { host: '127.0.0.1', port: 4318, tls: { enabled: false } },
        'http://localhost:4318',
      ),
    ).toBe(true);
  });

  it('uses HTTPS as the effective origin for TLS-enabled Runtime', () => {
    const server = { host: 'localhost', port: 4318, tls: { enabled: true } } as const;

    expect(isRuntimeOwnOrigin(server, 'https://127.0.0.1:4318')).toBe(true);
    expect(isRuntimeOwnOrigin(server, 'http://127.0.0.1:4318')).toBe(false);
  });

  it('does not treat a different port or external host as the Runtime origin', () => {
    const server = { host: '127.0.0.1', port: 4318, tls: { enabled: false } } as const;

    expect(isRuntimeOwnOrigin(server, 'http://127.0.0.1:5173')).toBe(false);
    expect(isRuntimeOwnOrigin(server, 'http://specflow.example.test:4318')).toBe(false);
  });
});
