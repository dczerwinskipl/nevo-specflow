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
  type DeviceStore,
} from '../../src/features/auth';
import type { WorkflowPort } from '../../src/features/workflow';
import { authCookieNames } from '../../src/features/auth/authentication/http/cookies';
import { InMemoryAuthenticationStore } from '../../src/features/auth/authentication/store/in-memory-store';
import { createRuntimeApp } from '../../src/server/app';
import { testOwnerDevice, withOwnerRequests } from '../support/owner-credential';
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
const finishBody = { step: 'implement', attempt: 1 };

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

/** The composed Runtime; every `inject` is a same-origin owner request unless `ownerHeader: false`. */
async function runtime(options: {
  pairing: DevicePairing;
  extra?: Partial<RuntimeConfig>;
  ownerHeader?: false;
}) {
  const calls: string[] = [];
  const app = await createRuntimeApp(config(options.extra), {
    auth: { devicePairing: options.pairing },
    workflow: { port: recordingPort(calls) },
    ...(options.extra?.sessions
      ? { sessions: { storage: { directory: await temporary(), projectId: 'project' } } }
      : {}),
  });
  apps.push(app);

  return { app: options.ownerHeader === false ? app : withOwnerRequests(app), calls };
}

async function temporary(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'nevo-pairing-'));
  directories.push(path);

  return path;
}

function cookie(response: { cookies: readonly { name: string; value: string }[] }, name: string) {
  return response.cookies.find((entry) => entry.name === name);
}

/** Starts a pairing request as a browser and returns its code and binding cookie. */
async function requestPairing(app: FastifyInstance, userAgent = 'Phone Browser') {
  const requested = await app.inject({
    method: 'POST',
    url: '/api/auth/pairing',
    payload: {},
    headers: { 'user-agent': userAgent },
  });
  expect(requested.statusCode).toBe(201);
  const body = requested.json<{ id: string; code: string; expiresAt: string }>();

  return { ...body, asRequester: { [cookies.pairing]: cookie(requested, cookies.pairing)!.value } };
}

describe('owner credential and device pairing (trusted local mode)', () => {
  it('refuses Finish, Return, Start and approval without the credential and admits them with it', async () => {
    const owner = testOwnerDevice(PORT);
    const { app, calls } = await runtime({ pairing: owner.devicePairing });
    const withOwner = { [owner.cookieName]: owner.credential };

    for (const [url, payload] of [
      [`${SPEC}/finish`, finishBody],
      [`${SPEC}/return`, { step: 'implement' }],
      [`${SPEC}/start`, {}],
      ['/api/auth/pairing/lookup', { code: 'ABCDEFGH' }],
      ['/api/auth/pairing/approve', { lookup: 'abc' }],
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

    // The device list is an owner read.
    expect((await app.inject('/api/auth/devices')).statusCode).toBe(403);
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
    // Other reads keep their own authorization: no credential needed.
    expect((await app.inject(`${SPEC}/actions`)).statusCode).toBe(404);
  });

  it('refuses owner requests from other origins and without the owner header', async () => {
    const owner = testOwnerDevice(PORT);
    const { app, calls } = await runtime({ pairing: owner.devicePairing, ownerHeader: false });
    const finish = (headers: Record<string, string>) =>
      app.inject({
        method: 'POST',
        url: `${SPEC}/finish`,
        payload: finishBody,
        cookies: { [owner.cookieName]: owner.credential },
        headers: { host: 'localhost:4318', ...headers },
      });
    const same = { 'x-nevo-owner': '1' };

    for (const headers of [
      {},
      { 'sec-fetch-site': 'same-origin', origin: 'http://localhost:4318' },
      { ...same, 'sec-fetch-site': 'same-site', origin: 'http://localhost:5173' },
      { ...same, origin: 'http://localhost:5173' },
      { ...same, 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' },
      { ...same, 'sec-fetch-site': 'cross-site' },
    ] as Record<string, string>[]) {
      const refused = await finish(headers);
      expect(refused.statusCode, JSON.stringify(headers)).toBe(403);
      expect(refused.json()).toEqual({ error: 'owner_request_refused' });
    }

    expect(calls).toEqual([]);
    for (const headers of [
      { ...same, 'sec-fetch-site': 'same-origin', origin: 'http://localhost:4318' },
      { ...same, origin: 'http://localhost:4318' },
      { ...same, 'sec-fetch-site': 'none' },
      same,
    ] as Record<string, string>[]) {
      expect((await finish(headers)).statusCode, JSON.stringify(headers)).toBe(404);
    }
  });

  it('rejects owner, actor and claim fields in request bodies', async () => {
    const owner = testOwnerDevice(PORT);
    const { app, calls } = await runtime({ pairing: owner.devicePairing });
    const withOwner = { [owner.cookieName]: owner.credential };

    for (const [url, payload] of [
      [`${SPEC}/finish`, { ...finishBody, ownedExecution: { sessionId: randomUUID() } }],
      [`${SPEC}/finish`, { ...finishBody, actor: { class: 'human' } }],
      ['/api/auth/pairing/lookup', { code: 'ABCDEFGH', ownedExecution: true }],
      ['/api/auth/pairing/approve', { lookup: 'abc', actor: 'owner' }],
      ['/api/auth/pairing/redeem', { kind: 'initial-code', code: 'ABCDEFGH', actor: 'owner' }],
      ['/api/auth/pairing', { claim: 'x' }],
    ] as const) {
      const response = await app.inject({ method: 'POST', url, payload, cookies: withOwner });
      expect(response.statusCode, url).toBe(400);
    }

    expect(calls).toEqual([]);
  });

  it('pairs a browser in two approval steps, bound to that browser, single use, then revokes it', async () => {
    let clock = Date.parse('2026-11-20T10:00:00.000Z');
    const owner = testOwnerDevice(PORT, { now: () => clock });
    const { app, calls } = await runtime({ pairing: owner.devicePairing });
    const withOwner = { [owner.cookieName]: owner.credential };

    const request = await requestPairing(app);
    expect(request.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(request.expiresAt).toBe('2026-11-20T10:02:00.000Z');

    // Only the requesting browser sees or redeems its request.
    expect((await app.inject(`/api/auth/pairing/${request.id}`)).statusCode).toBe(404);
    const pending = await app.inject({
      url: `/api/auth/pairing/${request.id}`,
      cookies: request.asRequester,
    });
    expect(pending.json()).toMatchObject({
      status: 'pending',
      origin: { userAgent: 'Phone Browser' },
    });
    const early = await app.inject({
      method: 'POST',
      url: '/api/auth/pairing/redeem',
      payload: { kind: 'pairing-request', id: request.id },
      cookies: request.asRequester,
    });
    expect(early.json()).toEqual({ error: 'pairing_not_approved' });

    clock += 20_000;
    const lookedUp = await app.inject({
      method: 'POST',
      url: '/api/auth/pairing/lookup',
      payload: { code: `${request.code.slice(0, 4)}-${request.code.slice(4).toLowerCase()}` },
      cookies: withOwner,
    });
    expect(lookedUp.statusCode).toBe(200);
    expect(lookedUp.json()).toMatchObject({
      id: request.id,
      origin: { userAgent: 'Phone Browser' },
      requestedAt: '2026-11-20T10:00:00.000Z',
    });
    const { lookup } = lookedUp.json<{ lookup: string }>();
    // Looking up is not approving.
    const stillPending = await app.inject({
      url: `/api/auth/pairing/${request.id}`,
      cookies: request.asRequester,
    });
    expect(stillPending.json()).toMatchObject({ status: 'pending' });

    const approve = () =>
      app.inject({
        method: 'POST',
        url: '/api/auth/pairing/approve',
        payload: { lookup },
        cookies: withOwner,
      });
    const approved = await approve();
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({
      id: request.id,
      origin: { userAgent: 'Phone Browser' },
    });
    expect((await approve()).json()).toEqual({ error: 'pairing_lookup_invalid' });
    const relookup = await app.inject({
      method: 'POST',
      url: '/api/auth/pairing/lookup',
      payload: { code: request.code },
      cookies: withOwner,
    });
    expect(relookup.json()).toEqual({ error: 'pairing_code_invalid' });

    const stranger = await app.inject({
      method: 'POST',
      url: '/api/auth/pairing/redeem',
      payload: { kind: 'pairing-request', id: request.id },
    });
    expect(stranger.json()).toEqual({ error: 'pairing_not_found' });

    const redeemed = await app.inject({
      method: 'POST',
      url: '/api/auth/pairing/redeem',
      payload: { kind: 'pairing-request', id: request.id },
      cookies: request.asRequester,
    });
    expect(redeemed.statusCode).toBe(201);
    const device = cookie(redeemed, cookies.device)!;
    expect(device).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/' });
    const deviceId = redeemed.json<{ device: { id: string } }>().device.id;
    const replay = await app.inject({
      method: 'POST',
      url: '/api/auth/pairing/redeem',
      payload: { kind: 'pairing-request', id: request.id },
      cookies: request.asRequester,
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

    // What the phone issued dies with it: its QR token and the request it approved.
    const token = (
      await app.inject({
        method: 'POST',
        url: '/api/auth/pairing/qr',
        payload: {},
        cookies: asPhone,
      })
    ).json<{ token: string }>().token;
    const next = await requestPairing(app, 'Laptop Browser');
    const nextLookup = (
      await app.inject({
        method: 'POST',
        url: '/api/auth/pairing/lookup',
        payload: { code: next.code },
        cookies: asPhone,
      })
    ).json<{ lookup: string }>().lookup;
    // A lookup is bound to the device that made it.
    const otherDevice = await app.inject({
      method: 'POST',
      url: '/api/auth/pairing/approve',
      payload: { lookup: nextLookup },
      cookies: withOwner,
    });
    expect(otherDevice.json()).toEqual({ error: 'pairing_lookup_invalid' });
    await app.inject({
      method: 'POST',
      url: '/api/auth/pairing/approve',
      payload: { lookup: nextLookup },
      cookies: asPhone,
    });

    const revoked = await app.inject({
      method: 'DELETE',
      url: `/api/auth/devices/${deviceId}`,
      cookies: withOwner,
    });
    expect(revoked.statusCode).toBe(204);
    expect((await finish()).statusCode).toBe(403);
    const deadToken = await app.inject({
      method: 'POST',
      url: '/api/auth/pairing/redeem',
      payload: { kind: 'qr-token', token },
    });
    expect(deadToken.json()).toEqual({ error: 'pairing_secret_invalid' });
    const deadApproval = await app.inject({
      method: 'POST',
      url: '/api/auth/pairing/redeem',
      payload: { kind: 'pairing-request', id: next.id },
      cookies: next.asRequester,
    });
    expect(deadApproval.json()).toEqual({ error: 'pairing_not_found' });
    expect(calls).toEqual(['finish']);
  });

  it('rejects an approval the owner did not start: unknown, expired and forged lookups', async () => {
    let clock = Date.parse('2026-11-20T10:00:00.000Z');
    const owner = testOwnerDevice(PORT, { now: () => clock });
    const { app } = await runtime({ pairing: owner.devicePairing });
    const withOwner = { [owner.cookieName]: owner.credential };
    const post = (url: string, payload: object) =>
      app.inject({ method: 'POST', url, payload, cookies: withOwner });

    expect((await post('/api/auth/pairing/lookup', { code: 'ZZZZ2222' })).json()).toEqual({
      error: 'pairing_code_invalid',
    });
    expect((await post('/api/auth/pairing/approve', { lookup: 'forged-lookup' })).json()).toEqual({
      error: 'pairing_lookup_invalid',
    });

    const request = await requestPairing(app);
    const { lookup } = (await post('/api/auth/pairing/lookup', { code: request.code })).json<{
      lookup: string;
    }>();
    clock += 2 * 60 * 1000;
    expect((await post('/api/auth/pairing/approve', { lookup })).json()).toEqual({
      error: 'pairing_lookup_invalid',
    });
    expect((await post('/api/auth/pairing/lookup', { code: request.code })).json()).toEqual({
      error: 'pairing_code_invalid',
    });
    // Expired requests are gone at once.
    const status = await app.inject({
      url: `/api/auth/pairing/${request.id}`,
      cookies: request.asRequester,
    });
    expect(status.statusCode).toBe(404);
  });

  it('limits pending requests per source and rate-limits pairing requests', async () => {
    let clock = Date.parse('2026-11-20T10:00:00.000Z');
    const { app } = await runtime({
      pairing: testOwnerDevice(PORT, { now: () => clock }).devicePairing,
    });
    const create = async () =>
      (await app.inject({ method: 'POST', url: '/api/auth/pairing', payload: {} })).statusCode;

    expect([await create(), await create(), await create(), await create()]).toEqual([
      201, 201, 201, 503,
    ]);
    // Unapproved requests are pruned at their expiry, which frees this source's slots.
    clock += 2 * 60 * 1000;
    const statuses = [];
    for (let index = 0; index < 7; index += 1) {
      statuses.push(await create());
      clock += 2 * 60 * 1000;
    }

    expect(statuses.slice(0, 6).every((status) => status === 201)).toBe(true);
    expect(statuses[6]).toBe(429);
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

  it('holds every Session start and Turn while the headless initial code file exists', async () => {
    const stateDirectory = await temporary();
    const restrict = vi.fn(() => Promise.resolve());
    const pairing = createDevicePairing({
      store: createMemoryDeviceStore(),
      stateDirectory,
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
    // An unpaired page learns that the code is in a file, never where.
    expect((await app.inject('/api/auth/device')).json()).toEqual({
      kind: 'device',
      present: false,
      anyDevicePaired: false,
      initialCode: 'file',
    });

    const redeemed = await app.inject({
      method: 'POST',
      url: '/api/auth/pairing/redeem',
      payload: { kind: 'initial-code', code },
    });
    expect(redeemed.statusCode).toBe(201);
    const asOwner = { [cookies.device]: cookie(redeemed, cookies.device)!.value };
    const createSession = () =>
      app.inject({
        method: 'POST',
        url: '/api/sessions',
        payload: { requestId: randomUUID(), providerId: 'mock', mode: 'read-only' },
        cookies: asOwner,
      });
    const { sessionId } = (await createSession()).json<{ sessionId: string }>();

    // `start --pair` writes a new code: the gate reads the file, not a flag.
    await pairing.issueInitialCode({ force: true });
    expect(pairing.headlessPairingPending()).toBe(true);
    const readTurn = () =>
      app.inject({
        method: 'POST',
        url: `/api/sessions/${sessionId}/turns`,
        payload: { requestId: randomUUID(), message: 'Read the state directory' },
        cookies: asOwner,
      });
    const heldTurn = await readTurn();
    expect(heldTurn.statusCode).toBe(409);
    expect(heldTurn.json()).toMatchObject({ code: 'SESSION_PAIRING_PENDING' });
    const heldStart = await createSession();
    expect(heldStart.statusCode).toBe(409);
    expect(heldStart.json()).toMatchObject({ code: 'SESSION_PAIRING_PENDING' });

    const second = await app.inject({
      method: 'POST',
      url: '/api/auth/pairing/redeem',
      payload: { kind: 'initial-code', code: (await readFile(file, 'utf8')).trim() },
    });
    expect(second.statusCode).toBe(201);
    await expect(stat(file)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(pairing.headlessPairingPending()).toBe(false);
    expect((await readTurn()).statusCode).toBe(202);
    expect((await createSession()).statusCode).toBe(201);
    // A spent initial code does not pair again.
    const spent = await app.inject({
      method: 'POST',
      url: '/api/auth/pairing/redeem',
      payload: { kind: 'initial-code', code },
    });
    expect(spent.json()).toEqual({ error: 'pairing_secret_invalid' });
  });

  it('keeps the initial code valid when storing the device fails', async () => {
    const stored = createMemoryDeviceStore();
    let failing = true;
    const store: DeviceStore = {
      list: () => stored.list(),
      add: (device) => (failing ? Promise.reject(new Error('disk full')) : stored.add(device)),
      remove: (id) => stored.remove(id),
    };
    const pairing = createDevicePairing({ store, stateDirectory: await temporary() });
    const lines: string[] = [];
    await pairing.issueInitialCode({ force: false, console: (line) => lines.push(line) });
    const code = /([A-HJ-NP-Z2-9]{4})-([A-HJ-NP-Z2-9]{4})/.exec(lines[0]!)!.slice(1).join('');
    const origin = { address: '127.0.0.1' };
    await expect(pairing.redeem({ kind: 'initial-code', code }, undefined, origin)).rejects.toThrow(
      'disk full',
    );
    failing = false;
    expect(await pairing.redeem({ kind: 'initial-code', code }, undefined, origin)).toMatchObject({
      ok: true,
    });
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
    const app = withOwnerRequests(
      await createRuntimeApp(
        {
          ...passwordConfig(),
          authorization: { assignments: [{ userId: 'demo-user', role: 'admin', scope: {} }] },
        },
        { auth: { store }, workflow: { port: recordingPort(calls) } },
      ),
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
