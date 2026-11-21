import type { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';
import { Type } from 'typebox';

import {
  DevicePairingErrorResponseSchema,
  InitialCodeCancelledSchema,
  OwnerCredentialStatusSchema,
  PairedDeviceListResponseSchema,
  PairingApprovedSchema,
  PairingApproveRequestSchema,
  PairingLookupRequestSchema,
  PairingLookupSchema,
  PairingQrTokenSchema,
  PairingRedeemedSchema,
  PairingRedeemRequestSchema,
  PairingRequestCreatedSchema,
  PairingRequestsClearedSchema,
  PairingRequestStatusSchema,
  type DevicePairingErrorCode,
  type OwnerCredentialStatus,
  type PairingApproveRequest,
  type PairingLookupRequest,
  type PairingRedeemRequest,
  type PairingOrigin,
} from '@nevo/specflow-contracts/authentication';
import { RateLimitedErrorResponseSchema } from '@nevo/specflow-contracts/runtime';

import { contractRef } from '../../../server/shared-contracts';
import {
  DEVICE_COOKIE_MAX_AGE_SECONDS,
  type DeviceCookieNames,
  type DeviceCookieOptions,
} from '../owner-credential/cookie';
import { PAIRING_TTL_MS, pairedDeviceView, type DevicePairing } from './pairing';

/** Per source: creating requests, approving codes and redeeming secrets (D21: rate-limited). */
export const PAIRING_SOURCE_ATTEMPT_LIMIT = 10;
export const PAIRING_SOURCE_WINDOW_MS = 60 * 1000;
const PAIRING_BODY_LIMIT = 4 * 1024;
const USER_AGENT_MAX_LENGTH = 256;
/** The request binding cookie is sent only to the pairing routes. */
const PAIRING_COOKIE_PATH = '/api/auth/pairing';

export interface DevicePairingEndpointOptions {
  /**
   * `device`: trusted local mode, devices are paired. `session`: required authentication, the
   * session is the credential. `not-required`: the demo Runtime.
   */
  readonly credential: 'device' | 'session' | 'not-required';
  /** Present with `device`. */
  readonly pairing?: DevicePairing;
  /** Under required authentication: whether the request has an authenticated session. */
  readonly hasSession: (request: FastifyRequest) => boolean;
  readonly cookieNames: DeviceCookieNames;
  readonly cookieOptions: DeviceCookieOptions;
}

const tags = ['Authentication'];
const rateLimit = { max: PAIRING_SOURCE_ATTEMPT_LIMIT, timeWindow: PAIRING_SOURCE_WINDOW_MS };
const rateLimited = {
  ...contractRef(RateLimitedErrorResponseSchema),
  description: `Too many pairing attempts from this source (${String(PAIRING_SOURCE_ATTEMPT_LIMIT)} per minute).`,
};
const pairingError = contractRef(DevicePairingErrorResponseSchema);
const notUsed = {
  ...pairingError,
  description:
    'Device pairing is not used: authentication is required (the session is the owner ' +
    'credential), or this is the demo Runtime (`pairing_not_used`).',
};
/** A closed empty body: no field (an owner, actor or claim) can ride along. */
const EmptyBody = Type.Object({}, { additionalProperties: false });
const IdParams = Type.Object(
  { id: Type.String({ minLength: 1, maxLength: 64, pattern: '^[0-9a-f-]+$' }) },
  { additionalProperties: false },
);

export const devicePairingEndpoint: FastifyPluginCallback<DevicePairingEndpointOptions> = (
  app,
  options,
  done,
) => {
  const routes = app;
  const pairing = options.credential === 'device' ? options.pairing : undefined;
  if (options.credential === 'device' && !pairing) {
    throw new Error('Trusted local mode needs device pairing.');
  }

  const deviceCredential = (request: FastifyRequest) => request.cookies[options.cookieNames.device];
  const binding = (request: FastifyRequest) => request.cookies[options.cookieNames.pairing];
  /** The owner device of an owner route: the guard admitted the request only with one. */
  const ownerDevice = (request: FastifyRequest) => {
    const device = pairing?.deviceOf(deviceCredential(request));
    if (!device) {
      throw new Error('An owner route was reached without a paired device.');
    }

    return device;
  };

  const refuse = (reply: FastifyReply, error: DevicePairingErrorCode) =>
    reply.code(errorStatus(error)).header('Cache-Control', 'no-store').send({ error });

  routes.get(
    '/api/auth/device',
    {
      config: { openApiPublic: true },
      schema: {
        tags,
        summary: 'Read whether this browser holds an owner credential',
        response: { 200: OwnerCredentialStatusSchema },
      },
    },
    (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      if (options.credential === 'not-required') {
        return { kind: 'not-required' } satisfies OwnerCredentialStatus;
      }

      if (!pairing) {
        return { kind: 'session', present: options.hasSession(request) };
      }

      const status = pairing.status(deviceCredential(request));

      return status.device
        ? {
            kind: 'device',
            present: true,
            device: pairedDeviceView(status.device, status.device),
          }
        : {
            kind: 'device',
            present: false,
            anyDevicePaired: status.anyDevicePaired,
            initialCode: status.initialCode,
          };
    },
  );

  routes.post(
    '/api/auth/pairing',
    {
      bodyLimit: PAIRING_BODY_LIMIT,
      config: {
        openApiPublic: true,
        ownerCredentialExempt: 'A browser without a credential asks to be paired.',
        rateLimit,
      },
      schema: {
        tags,
        summary: 'Request pairing of this browser',
        body: EmptyBody,
        response: {
          201: PairingRequestCreatedSchema,
          409: notUsed,
          429: rateLimited,
          503: { ...pairingError, description: 'Too many pending requests (`pairing_capacity`).' },
        },
      },
    },
    (request, reply) => {
      if (!pairing) {
        return refuse(reply, 'pairing_not_used');
      }

      const created = pairing.createRequest(originOf(request));
      if (!created.ok) {
        return refuse(reply, created.error);
      }

      reply.setCookie(options.cookieNames.pairing, created.value.binding, {
        ...options.cookieOptions,
        path: PAIRING_COOKIE_PATH,
        maxAge: (2 * PAIRING_TTL_MS) / 1000,
      });

      return reply
        .code(201)
        .header('Cache-Control', 'no-store')
        .send({
          id: created.value.id,
          code: created.value.code,
          expiresAt: new Date(created.value.expiresAt).toISOString(),
          origin: originOf(request),
        });
    },
  );

  routes.get(
    '/api/auth/pairing/:id',
    {
      config: { openApiPublic: true },
      schema: {
        tags,
        summary: "Read the status of this browser's pairing request",
        params: IdParams,
        response: {
          200: PairingRequestStatusSchema,
          404: {
            ...pairingError,
            description:
              'No request of this browser has this id (`pairing_not_found`): never started here, ' +
              'redeemed, or expired.',
          },
          409: notUsed,
        },
      },
    },
    (request, reply) => {
      if (!pairing) {
        return refuse(reply, 'pairing_not_used');
      }

      const status = pairing.requestStatus(idOf(request), binding(request));
      if (!status) {
        return refuse(reply, 'pairing_not_found');
      }

      return reply
        .header('Cache-Control', 'no-store')
        .send({ ...status, expiresAt: new Date(status.expiresAt).toISOString() });
    },
  );

  routes.post(
    '/api/auth/pairing/lookup',
    {
      bodyLimit: PAIRING_BODY_LIMIT,
      config: { rateLimit },
      schema: {
        tags,
        summary: 'Look up the pairing request of the code another browser shows',
        body: PairingLookupRequestSchema,
        response: {
          200: PairingLookupSchema,
          404: {
            ...pairingError,
            description:
              'No pending request has this code (`pairing_code_invalid`): never started, expired ' +
              'or already approved.',
          },
          409: notUsed,
          429: rateLimited,
        },
      },
    },
    (request, reply) => {
      if (!pairing) {
        return refuse(reply, 'pairing_not_used');
      }

      const found = pairing.lookup(
        (request.body as PairingLookupRequest).code,
        ownerDevice(request),
      );
      if (!found.ok) {
        return refuse(reply, found.error);
      }

      return reply.header('Cache-Control', 'no-store').send({
        lookup: found.value.lookup,
        id: found.value.id,
        origin: found.value.origin,
        requestedAt: new Date(found.value.requestedAt).toISOString(),
        expiresAt: new Date(found.value.expiresAt).toISOString(),
      });
    },
  );

  routes.post(
    '/api/auth/pairing/approve',
    {
      bodyLimit: PAIRING_BODY_LIMIT,
      config: { rateLimit },
      schema: {
        tags,
        summary: 'Approve a looked-up pairing request',
        body: PairingApproveRequestSchema,
        response: {
          200: PairingApprovedSchema,
          404: {
            ...pairingError,
            description:
              'This device made no open lookup with this value (`pairing_lookup_invalid`): ' +
              'unknown, used, expired, or made by another device.',
          },
          409: notUsed,
          429: rateLimited,
        },
      },
    },
    (request, reply) => {
      if (!pairing) {
        return refuse(reply, 'pairing_not_used');
      }

      const approved = pairing.approve(
        (request.body as PairingApproveRequest).lookup,
        ownerDevice(request),
      );
      if (!approved.ok) {
        return refuse(reply, approved.error);
      }

      return reply.header('Cache-Control', 'no-store').send({
        id: approved.value.id,
        origin: approved.value.origin,
        approvedAt: new Date(approved.value.approvedAt).toISOString(),
      });
    },
  );

  routes.post(
    '/api/auth/pairing/qr',
    {
      bodyLimit: PAIRING_BODY_LIMIT,
      config: { rateLimit },
      schema: {
        tags,
        summary: 'Create a one-time pairing token for a QR code',
        body: EmptyBody,
        response: {
          201: PairingQrTokenSchema,
          409: notUsed,
          429: rateLimited,
          503: { ...pairingError, description: 'Too many unused tokens (`pairing_capacity`).' },
        },
      },
    },
    (request, reply) => {
      if (!pairing) {
        return refuse(reply, 'pairing_not_used');
      }

      const issued = pairing.issueQrToken(ownerDevice(request));
      if (!issued.ok) {
        return refuse(reply, issued.error);
      }

      return reply
        .code(201)
        .header('Cache-Control', 'no-store')
        .send({
          token: issued.value.token,
          expiresAt: new Date(issued.value.expiresAt).toISOString(),
        });
    },
  );

  routes.post(
    '/api/auth/pairing/redeem',
    {
      bodyLimit: PAIRING_BODY_LIMIT,
      config: {
        openApiPublic: true,
        ownerCredentialExempt:
          'The browser proves its approved request, a QR token or the initial pairing code.',
        rateLimit,
      },
      schema: {
        tags,
        summary: 'Redeem a pairing for the device credential of this browser',
        body: PairingRedeemRequestSchema,
        response: {
          201: {
            ...PairingRedeemedSchema,
            'x-response-description':
              'Paired. The device credential is set as an `HttpOnly`, `SameSite=Strict` cookie.',
          },
          404: {
            ...pairingError,
            description:
              'Not redeemable: no approved request of this browser has this id ' +
              '(`pairing_not_found`), or the QR token or initial code is not valid ' +
              '(`pairing_secret_invalid`).',
          },
          409: {
            ...pairingError,
            description:
              "This browser's request is not approved yet (`pairing_not_approved`), or device " +
              'pairing is not used (`pairing_not_used`).',
          },
          429: rateLimited,
          503: { ...pairingError, description: 'Too many paired devices (`pairing_capacity`).' },
        },
      },
    },
    async (request, reply) => {
      if (!pairing) {
        return refuse(reply, 'pairing_not_used');
      }

      const body = request.body as PairingRedeemRequest;
      const redeemed = await pairing.redeem(body, binding(request), originOf(request));
      if (!redeemed.ok) {
        return refuse(reply, redeemed.error);
      }

      reply.setCookie(options.cookieNames.device, redeemed.value.credential, {
        ...options.cookieOptions,
        maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
      });
      if (body.kind === 'pairing-request') {
        reply.clearCookie(options.cookieNames.pairing, {
          ...options.cookieOptions,
          path: PAIRING_COOKIE_PATH,
        });
      }

      return reply
        .code(201)
        .header('Cache-Control', 'no-store')
        .send({ device: pairedDeviceView(redeemed.value.device, redeemed.value.device) });
    },
  );

  routes.delete(
    '/api/auth/pairing/requests',
    {
      schema: {
        tags,
        summary: 'Clear the pending pairing requests',
        description:
          'An owner clears every pending request: on loopback all local programs share one source ' +
          'address, so one of them can hold every pending slot.',
        response: { 200: PairingRequestsClearedSchema, 409: notUsed },
      },
    },
    (_request, reply) => {
      if (!pairing) {
        return refuse(reply, 'pairing_not_used');
      }

      return reply
        .header('Cache-Control', 'no-store')
        .send({ cleared: pairing.clearPendingRequests() });
    },
  );

  routes.delete(
    '/api/auth/pairing/initial-code',
    {
      schema: {
        tags,
        summary: 'Cancel the waiting initial pairing code',
        description:
          'A paired device cancels the one-time code a restart with `--pair` is waiting on: it ' +
          'pairs nothing afterwards and agent work resumes.',
        response: { 200: InitialCodeCancelledSchema, 409: notUsed },
      },
    },
    async (_request, reply) => {
      if (!pairing) {
        return refuse(reply, 'pairing_not_used');
      }

      return reply.header('Cache-Control', 'no-store').send(await pairing.cancelInitialCode());
    },
  );

  routes.get(
    '/api/auth/devices',
    {
      config: { ownerCredentialRequired: true },
      schema: {
        tags,
        summary: 'List the paired devices',
        response: { 200: PairedDeviceListResponseSchema, 409: notUsed },
      },
    },
    (request, reply) => {
      if (!pairing) {
        return refuse(reply, 'pairing_not_used');
      }

      const current = pairing.deviceOf(deviceCredential(request));

      return reply
        .header('Cache-Control', 'no-store')
        .send({ devices: pairing.list().map((device) => pairedDeviceView(device, current)) });
    },
  );

  routes.delete(
    '/api/auth/devices/:id',
    {
      config: {
        openApiResponses: {
          204: { description: 'Revoked: the device credential no longer counts. No body.' },
        },
      },
      schema: {
        tags,
        summary: 'Revoke a paired device',
        params: IdParams,
        response: {
          404: { ...pairingError, description: 'The device is not paired (`device_not_found`).' },
          409: notUsed,
        },
      },
    },
    async (request, reply) => {
      if (!pairing) {
        return refuse(reply, 'pairing_not_used');
      }

      if (!(await pairing.revoke(idOf(request)))) {
        return refuse(reply, 'device_not_found');
      }

      // The 204 is documentation-only (`openApiResponses`), outside the typed response schema.
      return (reply as FastifyReply).code(204).header('Cache-Control', 'no-store').send();
    },
  );

  done();
};

function idOf(request: FastifyRequest): string {
  return (request.params as { id: string }).id;
}

function originOf(request: FastifyRequest): PairingOrigin {
  const userAgent = request.headers['user-agent'];

  return {
    address: request.ip.slice(0, 64),
    ...(typeof userAgent === 'string' && userAgent.length > 0
      ? { userAgent: userAgent.slice(0, USER_AGENT_MAX_LENGTH) }
      : {}),
  };
}

function errorStatus(error: DevicePairingErrorCode): 404 | 409 | 503 {
  switch (error) {
    case 'pairing_not_found':
    case 'pairing_code_invalid':
    case 'pairing_secret_invalid':
    case 'pairing_lookup_invalid':
    case 'device_not_found':
      return 404;
    case 'pairing_not_used':
    case 'pairing_not_approved':
      return 409;
    case 'pairing_capacity':
      return 503;
  }
}
