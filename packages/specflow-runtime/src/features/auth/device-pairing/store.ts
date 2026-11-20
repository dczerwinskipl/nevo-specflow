import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { PairedDevice, PairingOrigin } from '@nevo/specflow-contracts/authentication';

/** A paired device as stored: only the digest of its credential, never the credential. */
export interface StoredDevice {
  readonly id: string;
  /** Hex SHA-256 of the device credential. */
  readonly credentialDigest: string;
  readonly label: string;
  readonly pairedAt: string;
  readonly pairedWith: PairedDevice['pairedWith'];
  readonly origin: PairingOrigin;
}

/** Paired devices of this Runtime's project (listed and revocable, D21). */
export interface DeviceStore {
  list(): readonly StoredDevice[];
  add(device: StoredDevice): Promise<void>;
  /** Whether the device was paired. */
  remove(id: string): Promise<boolean>;
}

export const DEVICE_STORE_FILE = 'devices.json';
const FORMAT_VERSION = 1;

export function createMemoryDeviceStore(initial: readonly StoredDevice[] = []): DeviceStore {
  let devices = [...initial];

  return {
    list: () => devices,
    add: (device) => {
      devices = [...devices, device];

      return Promise.resolve();
    },
    remove: (id) => {
      const before = devices.length;
      devices = devices.filter((device) => device.id !== id);

      return Promise.resolve(devices.length !== before);
    },
  };
}

/**
 * The device store in the Runtime's local state (`<stateRoot>/auth/devices.json`, owner-only).
 * Writes are serialized and atomic (a staged file renamed over the old one). A file that is not
 * this format fails the open: the Runtime does not start with devices it cannot read.
 */
export async function openFileDeviceStore(directory: string): Promise<DeviceStore> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, DEVICE_STORE_FILE);
  let devices = await readDevices(path);
  let tail: Promise<void> = Promise.resolve();
  const persist = (next: readonly StoredDevice[]) => {
    const write = tail.then(() => writeDevices(path, next));
    tail = write.catch(() => undefined);

    return write;
  };

  return {
    list: () => devices,
    async add(device) {
      const next = [...devices, device];
      await persist(next);
      devices = next;
    },
    async remove(id) {
      const next = devices.filter((device) => device.id !== id);
      if (next.length === devices.length) {
        return false;
      }

      await persist(next);
      devices = next;

      return true;
    },
  };
}

async function readDevices(path: string): Promise<StoredDevice[]> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  const parsed = JSON.parse(text) as unknown;
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as { version?: unknown }).version !== FORMAT_VERSION ||
    !Array.isArray((parsed as { devices?: unknown }).devices) ||
    !(parsed as { devices: unknown[] }).devices.every(isStoredDevice)
  ) {
    throw new Error(`The paired device store ${path} is not in a supported format.`);
  }

  return (parsed as { devices: StoredDevice[] }).devices;
}

function isStoredDevice(value: unknown): value is StoredDevice {
  const device = value as Partial<StoredDevice> | null;

  return (
    typeof device === 'object' &&
    device !== null &&
    typeof device.id === 'string' &&
    typeof device.credentialDigest === 'string' &&
    /^[0-9a-f]{64}$/.test(device.credentialDigest) &&
    typeof device.label === 'string' &&
    typeof device.pairedAt === 'string' &&
    (device.pairedWith === 'pairing-code' ||
      device.pairedWith === 'qr-token' ||
      device.pairedWith === 'initial-code') &&
    typeof device.origin === 'object' &&
    device.origin !== null &&
    typeof device.origin.address === 'string'
  );
}

async function writeDevices(path: string, devices: readonly StoredDevice[]): Promise<void> {
  const staged = `${path}.${randomUUID()}.tmp`;
  const handle = await open(staged, 'wx', 0o600);
  try {
    await handle.writeFile(JSON.stringify({ version: FORMAT_VERSION, devices }, null, 2));
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    await rename(staged, path);
  } catch (error) {
    await rm(staged, { force: true });

    throw error;
  }
}
