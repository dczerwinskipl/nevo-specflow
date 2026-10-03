export const AUTH_SESSION_COOKIE = 'nevo_session';
export const OIDC_COOKIE = 'nevo_oidc';

export interface AuthCookieOptions {
  readonly path: '/';
  readonly httpOnly: true;
  readonly sameSite: 'lax';
  readonly secure: boolean;
}

export function authCookieOptions(secure: boolean): AuthCookieOptions {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
  };
}
