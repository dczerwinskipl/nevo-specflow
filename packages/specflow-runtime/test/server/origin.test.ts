import { describe, expect, it } from 'vitest';

import { isRequestAtPublicOrigin } from '../../src/server/origin';

describe('Runtime public-origin request comparison', () => {
  it('treats equivalent loopback hosts as the same origin', () => {
    expect(isRequestAtPublicOrigin('http://localhost:4318', '127.0.0.1:4318', false)).toBe(true);
  });

  it('matches canonical external hostnames without inferring DNS from the bind host', () => {
    expect(
      isRequestAtPublicOrigin(
        'https://specflow.example.com:4318',
        'specflow.example.com:4318',
        true,
      ),
    ).toBe(true);
  });

  it('normalizes default ports and IPv6 host syntax', () => {
    expect(
      isRequestAtPublicOrigin('https://specflow.example.com', 'specflow.example.com', true),
    ).toBe(true);
    expect(isRequestAtPublicOrigin('http://[::1]:4318', '[::1]:4318', false)).toBe(true);
  });

  it('rejects a different direct host, port, or protocol', () => {
    expect(
      isRequestAtPublicOrigin('https://specflow.example.com:4318', '192.168.1.10:4318', true),
    ).toBe(false);
    expect(
      isRequestAtPublicOrigin(
        'https://specflow.example.com:4318',
        'specflow.example.com:4319',
        true,
      ),
    ).toBe(false);
    expect(
      isRequestAtPublicOrigin(
        'https://specflow.example.com:4318',
        'specflow.example.com:4318',
        false,
      ),
    ).toBe(false);
  });

  it('fails closed when the direct Host header is absent or malformed', () => {
    expect(
      isRequestAtPublicOrigin('https://specflow.example.com:4318', undefined, true),
    ).toBe(false);
    expect(
      isRequestAtPublicOrigin(
        'https://specflow.example.com:4318',
        'specflow.example.com:4318/path',
        true,
      ),
    ).toBe(false);
  });
});
