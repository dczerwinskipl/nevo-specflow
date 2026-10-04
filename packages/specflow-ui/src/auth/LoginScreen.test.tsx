import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  LoginScreenView,
  loginErrorMessage,
  oidcButtonVariant,
  safeReturnTo,
} from './LoginScreen';

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

  it('uses a primary OIDC action only when it is the sole login method', () => {
    expect(
      oidcButtonVariant({
        password: { enabled: false },
        oidc: [{ id: 'company', name: 'Company SSO' }],
      }),
    ).toBe('primary');
    expect(
      oidcButtonVariant({
        password: { enabled: false },
        oidc: [
          { id: 'company', name: 'Company SSO' },
          { id: 'customer', name: 'Customer SSO' },
        ],
      }),
    ).toBe('secondary');
    expect(
      oidcButtonVariant({
        password: { enabled: true },
        oidc: [{ id: 'company', name: 'Company SSO' }],
      }),
    ).toBe('secondary');
  });

  it('keeps a long allowed provider label inside the full-width action contract', () => {
    const html = renderToStaticMarkup(
      <LoginScreenView
        loginMethods={{
          password: { enabled: false },
          oidc: [{ id: 'northwind', name: 'Northwind Workforce Identity SSO' }],
        }}
      />,
    );

    expect(html).toContain('Continue with Northwind Workforce Identity SSO');
    expect(html).toContain('w-full');
    expect(html).toContain('truncate');
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
