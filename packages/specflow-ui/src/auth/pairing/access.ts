import type { DevicePairingApi } from './api';
import type { UnpairedStatus } from './PairDeviceScreen';

/** APIs whose browser is known to hold an owner credential (or needs none): asked once. */
const settled = new WeakSet<DevicePairingApi>();

/**
 * Whether this browser may use the app (D21): in trusted local mode only a paired device does, the
 * rest sees Pair this device. Answers the status to explain there, or undefined when it may. A Runtime that cannot answer does not block here; the protected
 * reads that follow report it with their own recovery.
 */
export async function resolvePairingAccess(
  api: DevicePairingApi,
): Promise<UnpairedStatus | undefined> {
  if (settled.has(api)) {
    return undefined;
  }

  try {
    const status = await api.getDevice();
    if (status.kind === 'device' && !status.present) {
      return status;
    }
  } catch {
    return undefined;
  }

  settled.add(api);

  return undefined;
}

/** A token after `#token=` in the address: a scanned QR code. */
export function qrTokenFromHash(hash: string): string | undefined {
  const token = new URLSearchParams(hash.replace(/^#/u, '')).get('token');

  return token && /^[A-Za-z0-9_-]{1,128}$/u.test(token) ? token : undefined;
}
