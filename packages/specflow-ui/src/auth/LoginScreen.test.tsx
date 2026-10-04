import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LoginScreenView, loginErrorMessage, safeReturnTo } from './LoginScreen';

describe('LoginScreen', () => {
  it('renders password and multiple OIDC methods without a containing card', () => {
    const html = renderToStaticMarkup(
      <LoginScreenView
        loginMethods={{
          password: { enabled: true },
          oidc: [
            { id: 'company', name: 'Company SSO' },
            { id: 'customer', name: 'Customer SSO' },
          ],
        }}
      />,
    );

    expect(html).toContain('Continue with Company SSO');
    expect(html).toContain('Continue with Customer SSO');
    expect(html).toContain('Username');
    expect(html).toContain('Password');
    expect(html).toContain('Sign in');
  });

  it('keeps return targets local', () => {
    expect(safeReturnTo('/specs/S1?tab=tasks')).toBe('/specs/S1?tab=tasks');
    expect(safeReturnTo('//evil.example/path')).toBe('/');
    expect(safeReturnTo('https://evil.example/path')).toBe('/');
    expect(safeReturnTo(undefined)).toBe('/');
  });

  it('maps callback errors to user-facing copy', () => {
    expect(loginErrorMessage('identity_not_allowed')).toMatch(/not allowed/i);
    expect(loginErrorMessage('invalid_oidc_transaction')).toMatch(/expired|valid/i);
  });
});
