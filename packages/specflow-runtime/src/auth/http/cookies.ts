export interface AuthCookieNames {
  readonly session: string;
  readonly oidc: string;
}

export interface AuthCookieOptions {
  readonly path: '/';
  readonly httpOnly: true;
  readonly sameSite: 'lax';
  readonly secure: boolean;
}

export function authCookieNames(port: number): AuthCookieNames {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Runtime cookie scope requires a valid server port.');
  }

  return {
    session: `nevo_session_${String(port)}`,
    oidc: `nevo_oidc_${String(port)}`,
  };
}

export function authCookieOptions(secure: boolean): AuthCookieOptions {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
  };
}
