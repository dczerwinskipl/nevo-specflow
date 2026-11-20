/** A paired device's credential and a pending pairing request's binding, both per Runtime port. */
export interface DeviceCookieNames {
  readonly device: string;
  readonly pairing: string;
}

export interface DeviceCookieOptions {
  readonly path: '/';
  readonly httpOnly: true;
  readonly sameSite: 'strict';
  readonly secure: boolean;
}

/** Browsers cap a cookie's lifetime at 400 days; revocation, not expiry, ends a device. */
export const DEVICE_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

export function deviceCookieNames(port: number): DeviceCookieNames {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Runtime cookie scope requires a valid server port.');
  }

  return {
    device: `nevo_device_${String(port)}`,
    pairing: `nevo_pairing_${String(port)}`,
  };
}

export function deviceCookieOptions(secure: boolean): DeviceCookieOptions {
  return { path: '/', httpOnly: true, sameSite: 'strict', secure };
}
