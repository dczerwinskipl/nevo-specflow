// Owner credential and device pairing (D21) through the composed Runtime routes, in-process
// (`inject`), with an injected clock and an in-memory or temporary local state. No Git, no network.
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RuntimeConfig } from '../../src/config/types';
import {
  INITIAL_CODE_FILE,
  createDevicePairing,
  createMemoryDeviceStore,
  deviceCookieNames,
  type DevicePairing,
} from '../../src/features/auth';
import type { WorkflowPort } from '../../src/features/workflow';
import { authCookieNames } from '../../src/features/auth/authentication/http/cookies';
import { InMemoryAuthenticationStore } from '../../src/features/auth/authentication/store/in-memory-store';
import { createRuntimeApp } from '../../src/server/app';
import { testOwnerDevice } from '../support/owner-credential';
import { noAuthConfig, passwordConfig } from './support/config';

const apps: FastifyInstance[] = [];
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

const PORT = 4318;
const cookies = deviceCookieNames(PORT);
const SPEC = '/api/specs/spec-1/workflow';

function config(extra: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    ...noAuthConfig(),
    authorization: { assignments: [{ userId: 'demo-user', role: 'admin', scope: {} }] },
    ...extra,
  };
}

/** A workflow backend that records each call and refuses it as "not found". */
function recordingPort(calls: string[]): WorkflowPort {
  const refuse = (name: string) => () => {
    calls.push(name);

    return Promise.reject(
      Object.assign(new Error('Not found.'), {
        name: 'WorkflowError',
        code: 'WORKFLOW_SUBJECT_NOT_FOUND',
      }),
    );
  };

  return {
    actions: refuse('actions'),
    start: refuse('start'),
    finish: refuse('finish'),
    return: refuse('return'),
    reevaluateWait: refuse('reevaluateWait'),
    abandon: refuse('abandon'),
  };
}

async function runtime(options: { pairing: DevicePairing; extra?: Partial<RuntimeConfig> }) {
  const calls: string[] = [];
  const app = await createRuntimeApp(config(options.extra), {
    auth: { devicePairing: options.pairing },
    workflow: { port: recordingPort(calls) },
    ...(options.extra?.sessions
      ? { sessions: { storage: { directory: await temporary(), projectId: 'project' } } }
      : {}),
  });
  apps.push(app);

  return { app, calls };
}

async function temporary(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'nevo-pairing-'));
  directories.push(path);

  return path;
}

function cookie(response: { cookies: readonly { name: string; value: string }[] }, name: string) {
  return response.cookies.find((entry) => entry.name === name);
}

const finishBody = { step: 'implement', attempt: 1 };

describe('owner credential and device pairing (trusted local mode)', () => {
  it('refuses Finish, Return, Start and approval without the credential and admits them with it', async () => {
    const owner = testOwnerDevice(PORT);
    const { app, calls } = await runtime({ pairing: owner.devicePairing });
    const withOwner = { [owner.cookieName]: owner.credential };

    for (const [url, payload] of [
      [`${SPEC}/finish`, finishBody],
      [`${SPEC}/return`, { step: 'implement' }],
      [`${SPEC}/start`, {}],
      ['/api/auth/pairing/approve', { code: 'ABCDEFGH' }],
      ['/api/auth/pairing/qr', {}],
    ] as const) {
      const refused = await app.inject({ method: 'POST', url, payload });
      expect(refused.statusCode, url).toBe(403);
      expect(refused.json()).toEqual({ error: 'owner_credential_required' });
      const forged = await app.inject({
        method: 'POST',
        url,
        payload,
        cookies: { [owner.cookieName]: 'forged' },
      });
      expect(forged.statusCode, url).toBe(403);
    }

    expect(calls).toEqual([]);
    for (const url of [`${SPEC}/finish`, `${SPEC}/return`, `${SPEC}/start`]) {
      const admitted = await app.inject({
        method: 'POST',
        url,
        payload: url.endsWith('finish') ? finishBody : url.endsWith('return') ? { step: 'a' } : {},
        cookies: withOwner,
      });
      expect(admitted.statusCode, url).toBe(404);
    }

    expect(calls).toEqual(['finish', 'return', 'start']);
    // Reads keep their own authorization: no credential needed.
    expect((await app.inject(`${SPEC}/actions`)).statusCode).toBe(404);
  });

  it('rejects owner, actor and claim fields in request bodies', async () => {
    const owner = testOwnerDevice(PORT);
    const { app, calls } = await runtime({ pairing: owner.devicePairing });
    const withOwner = { [owner.cookieName]: owner.credential };

    for (const [url, payload] of [
      [`${SPEC}/finish`, { ...finishBody, ownedExecution: { sessionId: randomUUID() } }],
      [`${SPEC}/finish`, { ...finishBody, actor: { class: 'human' } }],
      ['/api/auth/pairing/approve', { code: 'ABCDEFGH', ownedExecution: true }],
      ['/api/auth/pairing/redeem', { kind: 'initial-code', code: 'ABCDEFGH', actor: 'owner' }],
      ['/api/auth/pairing', { claim: 'x' }],
    ] as const) {
      const response = await app.inject({ method: 'POST', url, payload, cookies: withOwner });
      expect(response.statusCode, url).toBe(400);
    }

    expect(calls).toEqual([]);
  });

  it('pairs a browser with an approved code bound to it, single use, then revokes it', async () => {
    let clock = Date.parse('2026-11-20T10:00:00.000Z');
    const owner = testOwnerDevice(PORT, { now: () => clock });
    const { app, calls } = await runtime({ pairing: owner.devicePairing });
    const withOwner = { [owner.cookieName]: owner.credential };

    const requested = await app.inject({
      method: 'POST',
      url: '/api/auth/pairing',
      payload: {},
      headers: { 'user-agent': 'Phone Browser' },
    });
    expect(requested.statusCode).toBe(201);
    const request = requested.json<{ id: string; code: string; expiresAt: string }>();
    expect(request.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(request.expiresAt).toBe('2026-11-20T10:02:00.000Z');
    const binding = cookie(requested, cookies.pairing)!;
    expect(binding).toMatchObject({ httpOnly: true, sameSite: 'Strict' });
    const asRequester = { [cookies.pairing]: binding.value };

    // Only the requesting browser sees or redeems its request.
    expect((await app.inject(`/api/auth/pairing/${request.id}`)).statusCode).toBe(404);
    const pending = await app.inject({
      url: `/api/auth/pairing/${request.id}`,
      cookies: asRequester,
    });
    expect(pending.json()).toMatchObject({
      status: 'pending',
      origin: { userAgent: 'Phone Browser' },
    });
    const early = await app.inject({
      method: 'POST',
      url: '/api/auth/pairing/redeem',
      payload: { kind: 'pairing-request', id: request.id },
      cookies: asRequester,
    });
    expect(early.json()).toEqual({ error: 'pairing_not_approved' });

    const approved = await app.inject({
      method: 'POST',
      url: '/api/auth/pairing/approve',
      payload: { code: `${request.code.slice(0, 4)}-${request.code.slice(4).toLowerCase()}` },
      cookies: withOwner,
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({
      id: request.id,
      origin: { userAgent: 'Phone Browser' },
    });
    const again = await app.inject({
      method: 'POST',
      url: '/api/auth/pairing/approve',
      payload: { code: request.code },
      cookies: withOwner,
    });
    expect(again.json()).toEqual({ error: 'pairing_code_invalid' });

    const stranger = await app.inject({
      method: 'POST',
      url: '/api/auth/pairing/redeem',
      payload: { kind: 'pairing-request', id: request.id },
    });
    expect(stranger.json()).toEqual({ error: 'pairing_not_found' });

    clock += 30_000;
    const redeemed = await app.inject({
      method: 'POST',
      url: '/api/auth/pairing/redeem',
      payload: { kind: 'pairing-request', id: request.id },
      cookies: asRequester,
    });
    expect(redeemed.statusCode).toBe(201);
    const device = cookie(redeemed, cookies.device)!;
    expect(device).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/' });
    const deviceId = redeemed.json<{ device: { id: string } }>().device.id;
    const replay = await app.inject({
      method: 'POST',
      url: '/api/auth/pairing/redeem',
      payload: { kind: 'pairing-request', id: request.id },
      cookies: asRequester,
    });
    expect(replay.statusCode).toBe(404);

    const asPhone = { [cookies.device]: device.value };
    expect((await app.inject({ url: '/api/auth/device', cookies: asPhone })).json()).toMatchObject({
      kind: 'device',
      present: true,
      device: { id: deviceId, current: true, pairedWith: 'pairing-code' },
    });
    const finish = () =>
      app.inject({ method: 'POST', url: `${SPEC}/finish`, payload: finishBody, cookies: asPhone });
    expect((await finish()).statusCode).toBe(404);

    const listed = await app.inject({ url: '/api/auth/devices', cookies: withOwner });
    expect(listed.json<{ devices: { id: string }[] }>().devices.map((d) => d.id)).toContain(
      deviceId,
    );
    expect(JSON.stringify(listed.json())).not.toContain(device.value);
    const revoked = await app.inject({
      method: 'DELETE',
      url: `/api/auth/devices/${deviceId}`,
      cookies: withOwner,
    });
    expect(revoked.statusCode).toBe(204);
    expect((await finish()).statusCode).toBe(403);
    expect(calls).toEqual(['finish']);
  });

  it('rejects an approval the owner did not start: unknown and expired codes', async () => {
    let clock = Date.parse('2026-11-20T10:00:00.000Z');
    const owner = testOwnerDevice(PORT, { now: () => clock });
    const { app } = await runtime({ pairing: owner.devicePairing });
    const withOwner = { [owner.cookieName]: owner.credential };
    const approve = (code: string) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/pairing/approve',
        payload: { code },
        cookies: withOwner,
      });

    expect((await approve('ZZZZ2222')).json()).toEqual({ error: 'pairing_code_invalid' });

    const requested = await app.inject({ method: 'POST', url: '/api/auth/pairing', payload: {} });
    const { id, code } = requested.json<{ id: string; code: string }>();
    clock += 2 * 60 * 1000;
    expect((await approve(code)).json()).toEqual({ error: 'pairing_code_invalid' });
    const status = await app.inject({
      url: `/api/auth/pairing/${id}`,
      cookies: { [cookies.pairing]: cookie(requested, cookies.pairing)!.value },
    });
    expect(status.json()).toMatchObject({ status: 'expired' });
  });

  it('rate-limits pairing requests per source', async () => {
    const { app } = await runtime({ pairing: testOwnerDevice(PORT).devicePairing });
    const statuses: number[] = [];
    for (let index = 0; index < 11; index += 1) {
      statuses.push(
        (await app.inject({ method: 'POST', url: '/api/auth/pairing', payload: {} })).statusCode,
      );
    }

    expect(statuses.slice(0, 10).every((status) => status === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('pairs a phone with a one-time QR token', async () => {
    const owner = testOwnerDevice(PORT);
    const { app } = await runtime({ pairing: owner.devicePairing });
    const issued = await app.inject({
      method: 'POST',
      url: '/api/auth/pairing/qr',
      payload: {},
      cookies: { [owner.cookieName]: owner.credential },
    });
    expect(issued.statusCode).toBe(201);
    const { token } = issued.json<{ token: string }>();
    const redeem = () =>
      app.inject({
        method: 'POST',
        url: '/api/auth/pairing/redeem',
        payload: { kind: 'qr-token', token },
      });
    const first = await redeem();
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ device: { pairedWith: 'qr-token' } });
    expect((await redeem()).json()).toEqual({ error: 'pairing_secret_invalid' });
  });

  it('holds write Turns while the headless initial code file exists, and lifts it on pairing', async () => {
    const stateDirectory = await temporary();
    const restrict = vi.fn(() => Promise.resolve());
    const pairing = createDevicePairing({
      store: createMemoryDeviceStore(),
      stateDirectory,
      initialCodeFileLabel: '.nevo/local/state/auth/initial-pairing-code',
      platform: process.platform === 'win32' ? 'win32' : 'linux',
      restrictToOwner: restrict,
    });
    await pairing.issueInitialCode({ force: false });
    const file = join(stateDirectory, INITIAL_CODE_FILE);
    const code = (await readFile(file, 'utf8')).trim();
    if (process.platform === 'win32') {
      expect(restrict).toHaveBeenCalledWith(file);
    } else {
      expect((await stat(file)).mode & 0o777).toBe(0o600);
    }

    expect(pairing.headlessPairingPending()).toBe(true);
    const { app } = await runtime({
      pairing,
      extra: { sessions: { enabled: true, providers: { mock: { enabled: true } } } },
    });
    expect((await app.inject('/api/auth/device')).json()).toEqual({
      kind: 'device',
      present: false,
      anyDevicePaired: false,
      initialCode: 'file',
      initialCodeFile: '.nevo/local/state/auth/initial-pairing-code',
    });

    const redeemed = await app.inject({
      method: 'POST',
      url: '/api/auth/pairing/redeem',
      payload: { kind: 'initial-code', code },
    });
    expect(redeemed.statusCode).toBe(201);
    const asOwner = { [cookies.device]: cookie(redeemed, cookies.device)!.value };
    // Turned back on below: the gate reads the file, not a flag.
    await pairing.issueInitialCode({ force: true });
    expect(pairing.headlessPairingPending()).toBe(true);

    const created = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { requestId: randomUUID(), providerId: 'mock', mode: 'read-only' },
      cookies: asOwner,
    });
    const { sessionId } = created.json<{ sessionId: string }>();
    const write = () =>
      app.inject({
        method: 'POST',
        url: `/api/sessions/${sessionId}/turns`,
        payload: { requestId: randomUUID(), message: 'Edit it', mode: 'workspace-write' },
        cookies: asOwner,
      });
    const held = await write();
    expect(held.statusCode).toBe(409);
    expect(held.json()).toMatchObject({ code: 'SESSION_PAIRING_PENDING' });

    const second = await app.inject({
      method: 'POST',
      url: '/api/auth/pairing/redeem',
      payload: { kind: 'initial-code', code: (await readFile(file, 'utf8')).trim() },
    });
    expect(second.statusCode).toBe(201);
    await expect(stat(file)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(pairing.headlessPairingPending()).toBe(false);
    // The pairing hold is lifted: the mock provider's own refusal of a write Turn answers now.
    expect((await write()).json()).toMatchObject({ code: 'CAPABILITY_UNSUPPORTED' });
    // A spent initial code does not pair again.
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/pairing/redeem',
          payload: { kind: 'initial-code', code },
        })
      ).json(),
    ).toEqual({ error: 'pairing_secret_invalid' });

    // No credential, code or token ever reaches the ambient environment a provider could inherit.
    const ambient = JSON.stringify(process.env);
    for (const secret of [code, asOwner[cookies.device]]) {
      expect(ambient).not.toContain(secret);
    }
  });

  it('prints the initial code on an interactive console and writes no file', async () => {
    const stateDirectory = await temporary();
    const pairing = createDevicePairing({ store: createMemoryDeviceStore(), stateDirectory });
    const lines: string[] = [];
    await pairing.issueInitialCode({ force: false, console: (line) => lines.push(line) });
    expect(lines).toEqual([
      expect.stringMatching(/^Initial pairing code: [A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4} /),
    ]);
    expect(pairing.headlessPairingPending()).toBe(false);
    await expect(stat(join(stateDirectory, INITIAL_CODE_FILE))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});

describe('owner credential outside trusted local mode', () => {
  it('uses the authenticated session under required authentication', async () => {
    const store = new InMemoryAuthenticationStore();
    const session = store.createSession({
      userId: 'demo-user',
      authenticatedWith: { kind: 'password' },
    });
    const calls: string[] = [];
    const app = await createRuntimeApp(
      {
        ...passwordConfig(),
        authorization: { assignments: [{ userId: 'demo-user', role: 'admin', scope: {} }] },
      },
      { auth: { store }, workflow: { port: recordingPort(calls) } },
    );
    apps.push(app);
    const finish = (sessionCookie?: Record<string, string>) =>
      app.inject({
        method: 'POST',
        url: `${SPEC}/finish`,
        payload: finishBody,
        ...(sessionCookie ? { cookies: sessionCookie } : {}),
      });
    const refused = await finish();
    expect(refused.statusCode).toBe(401);
    expect(refused.json()).toEqual({ error: 'authentication_required' });
    expect((await app.inject('/api/auth/device')).json()).toEqual({
      kind: 'session',
      present: false,
    });
    expect((await finish({ [authCookieNames(PORT).session]: session })).statusCode).toBe(404);
    expect(calls).toEqual(['finish']);
    const pairing = await app.inject({ method: 'POST', url: '/api/auth/pairing', payload: {} });
    expect(pairing.json()).toEqual({ error: 'pairing_not_used' });
  });

  it('needs no credential on the demo Runtime', async () => {
    const demo = await createRuntimeApp(config(), { dataMode: 'demo' });
    apps.push(demo);
    expect((await demo.inject('/api/auth/device')).json()).toEqual({ kind: 'not-required' });
  });
});
