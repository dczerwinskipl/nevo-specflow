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

/** A pairing code, its request binding, a lookup and a QR token are valid about two minutes (D21). */
export const PAIRING_TTL_MS = 2 * 60 * 1000;
export const PAIRING_LIMITS = {
  pendingRequests: 32,
  /** Unapproved requests of one source address: one caller cannot take every slot. */
  pendingRequestsPerSource: 3,
  qrTokens: 16,
  devices: 100,
} as const;

interface PendingRequest {
  readonly id: string;
  readonly codeDigest: Buffer;
  /** Digest of the binding secret held by the requesting browser's cookie. */
  readonly bindingDigest: Buffer;
  readonly origin: PairingOrigin;
  readonly requestedAt: number;
  readonly expiresAt: number;
  /** The open lookup of an owner device: its digest and that device (step one of approval). */
  lookup?: { readonly digest: Buffer; readonly deviceId: string };
  approved?: { readonly at: number; readonly byDeviceId: string };
}

interface QrToken {
  readonly digest: Buffer;
  readonly expiresAt: number;
  readonly issuedByDeviceId: string;
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
  readonly now?: () => number;
  readonly platform?: NodeJS.Platform;
  readonly restrictToOwner?: RestrictToOwner;
  /** Reports a problem that must not stop pairing (a code file that could not be deleted). */
  readonly warn?: (message: string) => void;
  /** Pause between attempts to delete the spent code file. */
  readonly removeRetryDelayMs?: number;
  /** Deletes the code file (tests inject a failing one). */
  readonly removeCodeFile?: (path: string) => Promise<void>;
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
}

export interface PairingLookup {
  readonly lookup: string;
  readonly id: string;
  readonly origin: PairingOrigin;
  readonly requestedAt: number;
  readonly expiresAt: number;
}

/**
 * The headless gate (D21): true while a headless initial pairing code is waiting (in memory: the
 * gate does not depend on the code file being deleted). While it is true the
 * Runtime MUST refuse every Session start and Turn, every agent execution and every capability
 * minting, so no agent can read the code.
 */
export type HeadlessPairingGate = () => boolean;

export type DevicePairing = ReturnType<typeof createDevicePairing>;

const refuse = (error: DevicePairingErrorCode): PairingRefusal => ({ ok: false, error });

/**
 * Device pairing in trusted local mode (D21): pairing requests with an 8-character single-use code,
 * their two-step approval from a paired device (look up the code, then confirm that lookup),
 * one-time QR tokens, the initial pairing code, and the device credential check of the
 * owner-credential guard. Codes, bindings, lookups, tokens and credentials are held as SHA-256
 * digests and compared in constant time; pending requests and tokens live in memory.
 */
export function createDevicePairing(options: DevicePairingOptions) {
  const now = options.now ?? Date.now;
  const requests = new Map<string, PendingRequest>();
  let qrTokens: QrToken[] = [];
  let initial: { readonly digest: Buffer; readonly source: 'console' | 'file' } | undefined;
  /** An initial-code redeem is persisting its device: a second one with the code waits its turn. */
  let initialRedeeming = false;
  const initialCodePath = options.stateDirectory
    ? join(options.stateDirectory, INITIAL_CODE_FILE)
    : undefined;

  /** Unapproved requests go at their expiry; approved ones stay redeemable a TTL after approval. */
  const prune = () => {
    const at = now();
    for (const [id, request] of requests) {
      if (at >= (request.approved ? request.approved.at + PAIRING_TTL_MS : request.expiresAt)) {
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

  /**
   * Spends the initial code. The code and the headless gate are in memory, so they end first and
   * never wait on the file: deleting it is retried and a failure is reported, not thrown.
   * Answers whether no file is left.
   */
  const clearInitialCode = async (): Promise<boolean> => {
    initial = undefined;
    if (!initialCodePath) {
      return true;
    }

    const attempts = 3;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await (options.removeCodeFile ?? removeInitialCodeFile)(initialCodePath);

        return true;
      } catch (error) {
        if (attempt === attempts) {
          options.warn?.(
            `The spent initial pairing code file could not be deleted; delete it by hand: ${
              error instanceof Error ? error.message : 'unknown error'
            }`,
          );
        } else {
          await new Promise((resolve) => setTimeout(resolve, options.removeRetryDelayMs ?? 100));
        }
      }
    }

    return false;
  };

  /** Persists the device first; only a stored device spends a secret or lifts the gate. */
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
      const fromSource = [...requests.values()].filter(
        (request) => !request.approved && request.origin.address === origin.address,
      ).length;
      if (
        requests.size >= PAIRING_LIMITS.pendingRequests ||
        fromSource >= PAIRING_LIMITS.pendingRequestsPerSource
      ) {
        return refuse('pairing_capacity');
      }

      const code = newPairingCode();
      const binding = newSecret();
      const at = now();
      const request: PendingRequest = {
        id: randomUUID(),
        codeDigest: hashSecret(code),
        bindingDigest: hashSecret(binding),
        origin,
        requestedAt: at,
        expiresAt: at + PAIRING_TTL_MS,
      };
      requests.set(request.id, request);

      return {
        ok: true,
        value: { id: request.id, code, binding, expiresAt: request.expiresAt },
      };
    },

    /** The status of a request, for the browser that started it only (gone once expired). */
    requestStatus(id: string, binding: string | undefined) {
      const request = requestOf(id, binding);
      if (!request) {
        return undefined;
      }

      return {
        id: request.id,
        status: request.approved ? ('approved' as const) : ('pending' as const),
        expiresAt: request.expiresAt,
        origin: request.origin,
      };
    },

    /**
     * Approval step one: an owner device looks up the code a browser shows and sees where the
     * request came from and how old it is. A code of no pending request (never started, expired or
     * already approved) is refused. The lookup it returns is bound to this device.
     */
    lookup(code: string, owner: StoredDevice): PairingResult<PairingLookup> {
      prune();
      const request = findByDigest(
        requests.values(),
        (entry) => entry.codeDigest,
        normalizePairingCode(code),
      );
      if (!request || request.approved) {
        return refuse('pairing_code_invalid');
      }

      const lookup = newSecret();
      request.lookup = { digest: hashSecret(lookup), deviceId: owner.id };

      return {
        ok: true,
        value: {
          lookup,
          id: request.id,
          origin: request.origin,
          requestedAt: request.requestedAt,
          expiresAt: request.expiresAt,
        },
      };
    },

    /** Approval step two: the same owner device confirms the lookup it made (single use). */
    approve(
      lookup: string,
      owner: StoredDevice,
    ): PairingResult<{ id: string; origin: PairingOrigin; approvedAt: number }> {
      prune();
      const request = findByDigest(
        [...requests.values()].filter((entry) => entry.lookup !== undefined),
        (entry) => entry.lookup!.digest,
        lookup,
      );
      if (!request || request.approved || request.lookup?.deviceId !== owner.id) {
        return refuse('pairing_lookup_invalid');
      }

      const at = now();
      request.lookup = undefined;
      request.approved = { at, byDeviceId: owner.id };

      return { ok: true, value: { id: request.id, origin: request.origin, approvedAt: at } };
    },

    /** A one-time token a paired device shows as a QR code for a phone. */
    issueQrToken(owner: StoredDevice): PairingResult<{ token: string; expiresAt: number }> {
      prune();
      if (qrTokens.length >= PAIRING_LIMITS.qrTokens) {
        return refuse('pairing_capacity');
      }

      const token = newSecret();
      const expiresAt = now() + PAIRING_TTL_MS;
      qrTokens = [
        ...qrTokens,
        { digest: hashSecret(token), expiresAt, issuedByDeviceId: owner.id },
      ];

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

          if (!request.approved) {
            return refuse('pairing_not_approved');
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
            initialRedeeming ||
            !digestsEqual(current.digest, hashSecret(normalizePairingCode(input.code)))
          ) {
            return refuse('pairing_secret_invalid');
          }

          // The code is spent only once the device is stored; a failed write leaves it valid.
          initialRedeeming = true;
          try {
            return await pair('initial-code', origin);
          } finally {
            initialRedeeming = false;
          }
        }
      }
    },

    list(): readonly StoredDevice[] {
      return options.store.list();
    },

    /**
     * Clears every pending (unapproved) request, so one caller that holds the per-source slots
     * (on loopback every local program shares one source) cannot keep the owner out. Answers how
     * many were cleared.
     */
    clearPendingRequests(): number {
      prune();
      let cleared = 0;
      for (const [id, request] of requests) {
        if (!request.approved) {
          requests.delete(id);
          cleared += 1;
        }
      }

      return cleared;
    },

    /** A paired device cancels a waiting initial code: it pairs nothing and the headless gate lifts. */
    async cancelInitialCode(): Promise<{ cancelled: boolean; fileRemoved: boolean }> {
      if (!initial) {
        return { cancelled: false, fileRemoved: true };
      }

      return { cancelled: true, fileRemoved: await clearInitialCode() };
    },

    /** Revokes a device and everything it issued: its open lookups, approvals and QR tokens. */
    async revoke(id: string): Promise<boolean> {
      if (!(await options.store.remove(id))) {
        return false;
      }

      qrTokens = qrTokens.filter((token) => token.issuedByDeviceId !== id);
      for (const [requestId, request] of requests) {
        if (request.approved?.byDeviceId === id) {
          requests.delete(requestId);
        } else if (request.lookup?.deviceId === id) {
          request.lookup = undefined;
        }
      }

      return true;
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

    /** See {@link HeadlessPairingGate}. */
    headlessPairingPending: (() => initial?.source === 'file') satisfies HeadlessPairingGate,
  };
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
