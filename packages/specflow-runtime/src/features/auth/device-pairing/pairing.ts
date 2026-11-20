import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import type {
  DevicePairingErrorCode,
  PairedDevice,
  PairingOrigin,
  PairingRedeemRequest,
} from '@nevo/specflow-contracts/authentication';

import {
  INITIAL_CODE_FILE,
  initialCodeFileExists,
  removeInitialCodeFile,
  writeInitialCodeFile,
  type RestrictToOwner,
} from './initial-code';
import {
  digestsEqual,
  displayPairingCode,
  findByDigest,
  hashSecret,
  newPairingCode,
  newSecret,
  normalizePairingCode,
} from './secrets';
import type { DeviceStore, StoredDevice } from './store';

/** A pairing code, its request binding and a QR token are valid about two minutes (D21). */
export const PAIRING_TTL_MS = 2 * 60 * 1000;
export const PAIRING_LIMITS = { pendingRequests: 32, qrTokens: 16, devices: 100 } as const;

interface PendingRequest {
  readonly id: string;
  readonly codeDigest: Buffer;
  /** Digest of the binding secret held by the requesting browser's cookie. */
  readonly bindingDigest: Buffer;
  readonly origin: PairingOrigin;
  readonly expiresAt: number;
  approvedAt?: number;
}

interface QrToken {
  readonly digest: Buffer;
  readonly expiresAt: number;
}

export interface InitialCodeOptions {
  /** Pair again even though devices are paired (`nevo-specflow start --pair`). */
  readonly force: boolean;
  /**
   * The Runtime's interactive console (stdin and stdout are TTYs): the code is printed there.
   * Without one the Runtime is headless and the code goes to the owner-only file.
   */
  readonly console?: (line: string) => void;
}

export interface DevicePairingOptions {
  readonly store: DeviceStore;
  /** `<stateRoot>/auth`: where the headless initial code file is written. */
  readonly stateDirectory?: string;
  /** How the file is named to the UI (relative to the Project Home). */
  readonly initialCodeFileLabel?: string;
  readonly now?: () => number;
  readonly platform?: NodeJS.Platform;
  readonly restrictToOwner?: RestrictToOwner;
}

export type PairingResult<T> = { readonly ok: true; readonly value: T } | PairingRefusal;
export interface PairingRefusal {
  readonly ok: false;
  readonly error: DevicePairingErrorCode;
}

export interface DeviceCredentialStatus {
  readonly device?: StoredDevice;
  readonly anyDevicePaired: boolean;
  readonly initialCode: 'none' | 'console' | 'file';
  readonly initialCodeFile?: string;
}

export type DevicePairing = ReturnType<typeof createDevicePairing>;

const refuse = (error: DevicePairingErrorCode): PairingRefusal => ({ ok: false, error });

/**
 * Device pairing in trusted local mode (D21): pairing requests with an 8-character single-use code,
 * their approval from a paired device, one-time QR tokens, the initial pairing code, and the device
 * credential check of the owner-credential guard. Codes, bindings, tokens and credentials are held
 * as SHA-256 digests and compared in constant time; pending requests and tokens live in memory.
 */
export function createDevicePairing(options: DevicePairingOptions) {
  const now = options.now ?? Date.now;
  const requests = new Map<string, PendingRequest>();
  let qrTokens: QrToken[] = [];
  let initial: { readonly digest: Buffer; readonly source: 'console' | 'file' } | undefined;
  const initialCodePath = options.stateDirectory
    ? join(options.stateDirectory, INITIAL_CODE_FILE)
    : undefined;

  const prune = () => {
    const at = now();
    for (const [id, request] of requests) {
      if (at >= redeemableUntil(request)) {
        requests.delete(id);
      }
    }

    qrTokens = qrTokens.filter((token) => at < token.expiresAt);
  };

  const deviceOf = (credential: string | undefined): StoredDevice | undefined =>
    credential
      ? findByDigest(
          options.store.list(),
          (device) => Buffer.from(device.credentialDigest, 'hex'),
          credential,
        )
      : undefined;

  const requestOf = (id: string, binding: string | undefined): PendingRequest | undefined => {
    prune();
    const request = requests.get(id);

    return request && binding && digestsEqual(request.bindingDigest, hashSecret(binding))
      ? request
      : undefined;
  };

  const clearInitialCode = async () => {
    initial = undefined;
    if (initialCodePath) {
      await removeInitialCodeFile(initialCodePath);
    }
  };

  const pair = async (
    pairedWith: StoredDevice['pairedWith'],
    origin: PairingOrigin,
  ): Promise<PairingResult<{ device: StoredDevice; credential: string }>> => {
    if (options.store.list().length >= PAIRING_LIMITS.devices) {
      return refuse('pairing_capacity');
    }

    const credential = newSecret();
    const device: StoredDevice = {
      id: randomUUID(),
      credentialDigest: hashSecret(credential).toString('hex'),
      label: origin.userAgent ?? 'Unknown browser',
      pairedAt: new Date(now()).toISOString(),
      pairedWith,
      origin,
    };
    await options.store.add(device);
    // A new device ends the initial pairing: its code is spent and the headless gate lifts.
    await clearInitialCode();

    return { ok: true, value: { device, credential } };
  };

  return {
    /** The paired device whose credential this cookie value is. */
    deviceOf,

    status(credential: string | undefined): DeviceCredentialStatus {
      const device = deviceOf(credential);

      return {
        ...(device ? { device } : {}),
        anyDevicePaired: options.store.list().length > 0,
        initialCode: initial?.source ?? 'none',
        ...(initial?.source === 'file' && options.initialCodeFileLabel
          ? { initialCodeFile: options.initialCodeFileLabel }
          : {}),
      };
    },

    /** A request any caller may start; only an owner's approval makes it redeemable. */
    createRequest(origin: PairingOrigin): PairingResult<{
      id: string;
      code: string;
      binding: string;
      expiresAt: number;
    }> {
      prune();
      if (requests.size >= PAIRING_LIMITS.pendingRequests) {
        return refuse('pairing_capacity');
      }

      const code = newPairingCode();
      const binding = newSecret();
      const request: PendingRequest = {
        id: randomUUID(),
        codeDigest: hashSecret(code),
        bindingDigest: hashSecret(binding),
        origin,
        expiresAt: now() + PAIRING_TTL_MS,
      };
      requests.set(request.id, request);

      return {
        ok: true,
        value: { id: request.id, code, binding, expiresAt: request.expiresAt },
      };
    },

    /** The status of a request, for the browser that started it only. */
    requestStatus(id: string, binding: string | undefined) {
      const request = requestOf(id, binding);
      if (!request) {
        return undefined;
      }

      const status: 'pending' | 'approved' | 'expired' =
        request.approvedAt !== undefined
          ? 'approved'
          : now() < request.expiresAt
            ? 'pending'
            : 'expired';

      return { id: request.id, status, expiresAt: request.expiresAt, origin: request.origin };
    },

    /**
     * An owner approves the code a browser shows. A code of no pending request (never started,
     * expired or already approved) is refused: the owner approves only a request they started.
     */
    approve(
      code: string,
    ): PairingResult<{ id: string; origin: PairingOrigin; approvedAt: number }> {
      prune();
      const at = now();
      const request = findByDigest(
        requests.values(),
        (entry) => entry.codeDigest,
        normalizePairingCode(code),
      );
      if (!request || request.approvedAt !== undefined || at >= request.expiresAt) {
        return refuse('pairing_code_invalid');
      }

      request.approvedAt = at;

      return { ok: true, value: { id: request.id, origin: request.origin, approvedAt: at } };
    },

    /** A one-time token a paired device shows as a QR code for a phone. */
    issueQrToken(): PairingResult<{ token: string; expiresAt: number }> {
      prune();
      if (qrTokens.length >= PAIRING_LIMITS.qrTokens) {
        return refuse('pairing_capacity');
      }

      const token = newSecret();
      const expiresAt = now() + PAIRING_TTL_MS;
      qrTokens = [...qrTokens, { digest: hashSecret(token), expiresAt }];

      return { ok: true, value: { token, expiresAt } };
    },

    /** Issues this browser's device credential for an approved request, a QR token or the initial code. */
    async redeem(
      input: PairingRedeemRequest,
      binding: string | undefined,
      origin: PairingOrigin,
    ): Promise<PairingResult<{ device: StoredDevice; credential: string }>> {
      prune();
      switch (input.kind) {
        case 'pairing-request': {
          const request = requestOf(input.id, binding);
          if (!request) {
            return refuse('pairing_not_found');
          }

          if (request.approvedAt === undefined) {
            return refuse(now() < request.expiresAt ? 'pairing_not_approved' : 'pairing_not_found');
          }

          requests.delete(request.id);

          return pair('pairing-code', request.origin);
        }

        case 'qr-token': {
          const token = findByDigest(qrTokens, (entry) => entry.digest, input.token);
          if (!token) {
            return refuse('pairing_secret_invalid');
          }

          qrTokens = qrTokens.filter((entry) => entry !== token);

          return pair('qr-token', origin);
        }

        case 'initial-code': {
          const current = initial;
          if (
            !current ||
            !digestsEqual(current.digest, hashSecret(normalizePairingCode(input.code)))
          ) {
            return refuse('pairing_secret_invalid');
          }

          initial = undefined;

          return pair('initial-code', origin);
        }
      }
    },

    list(): readonly StoredDevice[] {
      return options.store.list();
    },

    async revoke(id: string): Promise<boolean> {
      return options.store.remove(id);
    },

    /**
     * At Runtime start: while no device is paired, or with `--pair`, issue one initial pairing
     * code: on the interactive console, or in the owner-only file of a headless Runtime. Otherwise a
     * stale file of an earlier start is removed.
     */
    async issueInitialCode(issue: InitialCodeOptions): Promise<void> {
      if (!issue.force && options.store.list().length > 0) {
        await clearInitialCode();

        return;
      }

      const code = newPairingCode();
      if (issue.console) {
        if (initialCodePath) {
          await removeInitialCodeFile(initialCodePath);
        }

        initial = { digest: hashSecret(code), source: 'console' };
        issue.console(
          `Initial pairing code: ${displayPairingCode(code)} (enter it on the device to pair; single use)`,
        );

        return;
      }

      if (!initialCodePath) {
        throw new Error('A headless Runtime needs local state for its initial pairing code.');
      }

      await writeInitialCodeFile(initialCodePath, `${code}\n`, {
        ...(options.platform ? { platform: options.platform } : {}),
        ...(options.restrictToOwner ? { restrict: options.restrictToOwner } : {}),
      });
      initial = { digest: hashSecret(code), source: 'file' };
    },

    /**
     * The headless gate (D21): true while the initial pairing code file exists. Every agent
     * execution, capability minting and write Turn MUST be refused while it is true.
     */
    headlessPairingPending(): boolean {
      return initialCodePath !== undefined && initialCodeFileExists(initialCodePath);
    },
  };
}

function redeemableUntil(request: PendingRequest): number {
  return request.approvedAt !== undefined
    ? request.approvedAt + PAIRING_TTL_MS
    : request.expiresAt + PAIRING_TTL_MS;
}

export function pairedDeviceView(
  device: StoredDevice,
  current: StoredDevice | undefined,
): PairedDevice {
  return {
    id: device.id,
    label: device.label,
    pairedAt: device.pairedAt,
    pairedWith: device.pairedWith,
    origin: device.origin,
    current: current?.id === device.id,
  };
}
