import { createHash } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import type { RuntimeConfig } from '../../src/config/types';
import {
  createDevicePairing,
  createMemoryDeviceStore,
  deviceCookieNames,
  type DevicePairing,
  type DevicePairingOptions,
} from '../../src/features/auth';
import { createRuntimeApp, type RuntimeAppDependencies } from '../../src/server/app';

const TEST_CREDENTIAL = 'test-owner-device-credential';

/**
 * A paired owner device for route tests in trusted local mode (D21): owner routes need its
 * credential cookie. In-memory, no state on disk.
 */
export function testOwnerDevice(
  port = 4318,
  options: Omit<DevicePairingOptions, 'store'> = {},
): {
  readonly devicePairing: DevicePairing;
  readonly cookieName: string;
  readonly credential: string;
} {
  const store = createMemoryDeviceStore([
    {
      id: '00000000-0000-4000-8000-000000000001',
      credentialDigest: createHash('sha256').update(TEST_CREDENTIAL).digest('hex'),
      label: 'Test owner device',
      pairedAt: '2026-01-01T00:00:00.000Z',
      pairedWith: 'initial-code',
      origin: { address: '127.0.0.1' },
    },
  ]);

  return {
    devicePairing: createDevicePairing({ ...options, store }),
    cookieName: deviceCookieNames(port).device,
    credential: TEST_CREDENTIAL,
  };
}

/** Every `inject` of the app carries the owner device cookie (a request's own cookies win). */
export function withOwnerCookie<App extends FastifyInstance>(
  app: App,
  cookieName: string,
  credential: string,
): App {
  const inject = app.inject.bind(app) as (options: unknown) => unknown;
  (app as { inject: unknown }).inject = (options: unknown) =>
    inject(
      typeof options === 'object' && options !== null
        ? {
            ...options,
            cookies: {
              [cookieName]: credential,
              ...(options as { cookies?: Record<string, string> }).cookies,
            },
          }
        : options,
    );

  return app;
}

/** `createRuntimeApp` as a paired owner device: for route tests that are not about the credential. */
export async function createOwnerRuntimeApp(
  config: RuntimeConfig,
  dependencies: RuntimeAppDependencies = {},
): Promise<FastifyInstance> {
  const owner = testOwnerDevice(config.server.port);
  const app = await createRuntimeApp(config, {
    ...dependencies,
    auth: { ...dependencies.auth, devicePairing: owner.devicePairing },
  });

  return withOwnerCookie(app, owner.cookieName, owner.credential);
}
