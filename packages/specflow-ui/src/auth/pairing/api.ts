import { isHttpClientError, type HttpClient } from '@nevo/http-client';
import type {
  InitialCodeCancelled,
  OwnerCredentialStatus,
  PairedDeviceListResponse,
  PairingApproved,
  PairingLookup,
  PairingQrToken,
  PairingRedeemed,
  PairingRedeemRequest,
  PairingRequestCreated,
  PairingRequestStatus,
  PairingRequestsCleared,
} from '@nevo/specflow-contracts/authentication';

/** Device pairing of this browser and the owner operations of a paired device (D21). */
export interface DevicePairingApi {
  /** Whether this browser holds an owner credential, and the facts the pairing screen explains. */
  getDevice(): Promise<OwnerCredentialStatus>;
  /** This browser asks to be paired and gets the code it shows. */
  requestPairing(): Promise<PairingRequestCreated>;
  getRequest(id: string): Promise<PairingRequestStatus>;
  redeem(request: PairingRedeemRequest): Promise<PairingRedeemed>;
  /** Approval step one, from a paired device: look up the code another browser shows. */
  lookup(code: string): Promise<PairingLookup>;
  /** Approval step two: confirm the lookup this device made. */
  approve(lookup: string): Promise<PairingApproved>;
  createQrToken(): Promise<PairingQrToken>;
  listDevices(): Promise<PairedDeviceListResponse>;
  revokeDevice(id: string): Promise<void>;
  /** Clears every pending request: one local caller can hold every place. */
  clearPendingRequests(): Promise<PairingRequestsCleared>;
  /** Cancels the one-time code a restart with `--pair` is waiting on. */
  cancelInitialCode(): Promise<InitialCodeCancelled>;
}

const encoded = encodeURIComponent;

export function createBrowserDevicePairingApi(client: HttpClient): DevicePairingApi {
  return {
    getDevice: () => client.get<OwnerCredentialStatus>('/api/auth/device'),
    requestPairing: () => client.post<PairingRequestCreated, object>('/api/auth/pairing', {}),
    getRequest: (id) => client.get<PairingRequestStatus>(`/api/auth/pairing/${encoded(id)}`),
    redeem: (request) =>
      client.post<PairingRedeemed, PairingRedeemRequest>('/api/auth/pairing/redeem', request),
    lookup: (code) =>
      client.post<PairingLookup, { code: string }>('/api/auth/pairing/lookup', { code }),
    approve: (lookup) =>
      client.post<PairingApproved, { lookup: string }>('/api/auth/pairing/approve', { lookup }),
    createQrToken: () => client.post<PairingQrToken, object>('/api/auth/pairing/qr', {}),
    listDevices: () => client.get<PairedDeviceListResponse>('/api/auth/devices'),
    async revokeDevice(id) {
      await client.delete<void>(`/api/auth/devices/${encoded(id)}`);
    },
    clearPendingRequests: () => client.delete<PairingRequestsCleared>('/api/auth/pairing/requests'),
    cancelInitialCode: () => client.delete<InitialCodeCancelled>('/api/auth/pairing/initial-code'),
  };
}

/** What a failed pairing call means for the screen that made it. */
export type PairingFailure =
  /** The code is not valid: mistyped, used, expired or replaced. */
  | { readonly kind: 'invalid' }
  /** An owner route refused: the page was not opened from the Runtime's own address. */
  | { readonly kind: 'owner-request-refused' }
  /** An owner route refused: this browser is not (or no longer) paired. */
  | { readonly kind: 'owner-credential-required' }
  /** Too many tries; `retryAfterSeconds` when the Runtime said when. */
  | { readonly kind: 'rate-limited'; readonly retryAfterSeconds?: number }
  /** Too many pending requests, tokens or devices. */
  | { readonly kind: 'capacity' }
  | { readonly kind: 'not-used' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'unavailable' };

export function pairingFailure(error: unknown): PairingFailure {
  if (!isHttpClientError(error) || error.kind !== 'http') {
    return { kind: 'unavailable' };
  }

  if (error.status === 429) {
    const seconds = Number(error.headers?.['retry-after']);

    return {
      kind: 'rate-limited',
      ...(Number.isFinite(seconds) && seconds > 0 ? { retryAfterSeconds: seconds } : {}),
    };
  }

  switch (errorCodeOf(error.data)) {
    case 'owner_request_refused':
      return { kind: 'owner-request-refused' };
    case 'owner_credential_required':
      return { kind: 'owner-credential-required' };
    case 'pairing_capacity':
      return { kind: 'capacity' };
    case 'pairing_not_used':
      return { kind: 'not-used' };
    case 'pairing_code_invalid':
    case 'pairing_lookup_invalid':
    case 'pairing_secret_invalid':
      return { kind: 'invalid' };
    case 'pairing_not_found':
    case 'pairing_not_approved':
    case 'device_not_found':
      return { kind: 'not-found' };
    default:
      return { kind: 'unavailable' };
  }
}

function errorCodeOf(data: unknown): string | undefined {
  return typeof data === 'object' &&
    data !== null &&
    typeof (data as { error?: unknown }).error === 'string'
    ? (data as { error: string }).error
    : undefined;
}
