import { HttpClientError } from '@nevo/http-client';
import type { PairedDevice } from '@nevo/specflow-contracts/authentication';

import type { DevicePairingApi } from './api';
import type { QrModules } from './qr';

/** A refusal as the Runtime answers it: its status and `{ error }` body. */
export function refusal(
  status: number,
  error: string,
  headers: Record<string, string> = {},
): HttpClientError {
  return new HttpClientError('refused', { kind: 'http', status, data: { error }, headers });
}

/** A call that never answers: the state while it runs. */
export const never = <T>(): Promise<T> => new Promise<T>(() => undefined);

export const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
export const FIREFOX_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:130.0) Gecko/20100101 Firefox/130.0';
export const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
export const FIREFOX_LINUX =
  'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';

export function pairedDevices(): PairedDevice[] {
  const origin = { address: '192.168.1.20' };

  return [
    {
      id: 'd1',
      label: CHROME_WINDOWS,
      pairedAt: '2026-11-12T09:00:00.000Z',
      pairedWith: 'initial-code',
      origin: { address: '127.0.0.1', userAgent: CHROME_WINDOWS },
      current: true,
    },
    {
      id: 'd2',
      label: SAFARI_IPHONE,
      pairedAt: '2026-11-18T09:00:00.000Z',
      pairedWith: 'qr-token',
      origin: { address: '100.101.7.12', userAgent: SAFARI_IPHONE },
      current: false,
    },
    {
      id: 'd3',
      label: FIREFOX_LINUX,
      pairedAt: '2026-11-03T09:00:00.000Z',
      pairedWith: 'pairing-code',
      origin: { ...origin, userAgent: FIREFOX_LINUX },
      current: false,
    },
  ];
}

const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

/** A pairing API whose calls answer like a Runtime with one pending request; override per state. */
export function fakePairingApi(overrides: Partial<DevicePairingApi> = {}): DevicePairingApi {
  return {
    getDevice: () =>
      Promise.resolve({ kind: 'device', present: true, device: pairedDevices()[0]! }),
    requestPairing: () =>
      Promise.resolve({
        id: 'r1',
        code: 'K7QFM2XD',
        expiresAt: inMinutes(1.8),
        origin: { address: '192.168.1.20', userAgent: FIREFOX_MAC },
      }),
    getRequest: () =>
      Promise.resolve({
        id: 'r1',
        status: 'pending',
        expiresAt: inMinutes(1.8),
        origin: { address: '192.168.1.20' },
      }),
    redeem: () =>
      Promise.resolve({
        device: { ...pairedDevices()[0]!, label: FIREFOX_MAC, current: true },
      }),
    lookup: () =>
      Promise.resolve({
        lookup: 'lookup-token',
        id: 'r1',
        origin: { address: '100.101.7.12', userAgent: SAFARI_IPHONE },
        requestedAt: new Date(Date.now() - 12_000).toISOString(),
        expiresAt: inMinutes(1.7),
      }),
    approve: () =>
      Promise.resolve({
        id: 'r1',
        origin: { address: '100.101.7.12', userAgent: SAFARI_IPHONE },
        approvedAt: new Date().toISOString(),
      }),
    createQrToken: () => Promise.resolve({ token: 'qr-token-1', expiresAt: inMinutes(1.85) }),
    listDevices: () => Promise.resolve({ devices: pairedDevices() }),
    revokeDevice: () => Promise.resolve(),
    clearPendingRequests: () => Promise.resolve({ cleared: 3 }),
    cancelInitialCode: () => Promise.resolve({ cancelled: true, fileRemoved: true }),
    ...overrides,
  };
}

/** A fixed pattern with the three finder squares: only for stories and tests, never scanned. */
export function patternQr(): QrModules {
  const size = 29;
  let seed = 7;
  const inFinder = (x: number, y: number) =>
    [
      [0, 0],
      [size - 7, 0],
      [0, size - 7],
    ].some(([fx, fy]) => x >= fx! && x < fx! + 7 && y >= fy! && y < fy! + 7);

  return Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;

      return inFinder(x, y)
        ? x % 6 === 0 || y % 6 === 0 || (x % 6 > 1 && y % 6 > 1)
        : seed % 3 === 0;
    }),
  );
}
