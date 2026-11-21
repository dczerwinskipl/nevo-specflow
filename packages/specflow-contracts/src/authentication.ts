import { Type, type Static } from 'typebox';

export const PASSWORD_USERNAME_MAX_LENGTH = 256;
export const PASSWORD_MAX_LENGTH = 1_024;
export const OIDC_PROVIDER_ID_MAX_LENGTH = 64;
export const OIDC_PROVIDER_NAME_MAX_LENGTH = 32;
export const OIDC_RETURN_TO_MAX_LENGTH = 2_048;

export const AuthUserSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    name: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type AuthUser = Static<typeof AuthUserSchema>;

export const AuthSessionMethodSchema = Type.Union([
  Type.Object(
    {
      kind: Type.Literal('password'),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      kind: Type.Literal('oidc'),
      providerId: Type.String({ minLength: 1, maxLength: OIDC_PROVIDER_ID_MAX_LENGTH }),
    },
    { additionalProperties: false },
  ),
]);
export type AuthSessionMethod = Static<typeof AuthSessionMethodSchema>;

export const AuthLoginMethodsSchema = Type.Object(
  {
    password: Type.Object(
      {
        enabled: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
    oidc: Type.Array(
      Type.Object(
        {
          id: Type.String({ minLength: 1, maxLength: OIDC_PROVIDER_ID_MAX_LENGTH }),
          name: Type.String({ minLength: 1, maxLength: OIDC_PROVIDER_NAME_MAX_LENGTH }),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);
export type AuthLoginMethods = Static<typeof AuthLoginMethodsSchema>;

/**
 * The actor id the offline CLI records for the OS user the Runtime runs as (`local:<os-user>`).
 * Present only when authentication is not required: then the person at this machine is the viewer,
 * so a recorded `local:<os-user>` action is theirs, whichever channel (UI or CLI) recorded it.
 */
const LocalActorIdSchema = Type.String({ minLength: 7, pattern: '^local:' });

const AuthenticatedSessionSchema = Type.Object(
  {
    authenticationRequired: Type.Boolean(),
    authenticated: Type.Literal(true),
    user: AuthUserSchema,
    authenticatedWith: AuthSessionMethodSchema,
    loginMethods: AuthLoginMethodsSchema,
    localActorId: Type.Optional(LocalActorIdSchema),
  },
  { additionalProperties: false },
);

const UnauthenticatedSessionSchema = Type.Object(
  {
    authenticationRequired: Type.Boolean(),
    authenticated: Type.Literal(false),
    user: Type.Optional(AuthUserSchema),
    loginMethods: AuthLoginMethodsSchema,
    localActorId: Type.Optional(LocalActorIdSchema),
  },
  { additionalProperties: false },
);

export const AuthSessionResponseSchema = Type.Union(
  [AuthenticatedSessionSchema, UnauthenticatedSessionSchema],
  { $id: 'AuthSessionResponse' },
);
export type AuthSessionResponse = Static<typeof AuthSessionResponseSchema>;

export const PasswordLoginRequestSchema = Type.Object(
  {
    username: Type.String({ minLength: 1, maxLength: PASSWORD_USERNAME_MAX_LENGTH }),
    password: Type.String({ minLength: 1, maxLength: PASSWORD_MAX_LENGTH }),
  },
  { additionalProperties: false },
);
export type PasswordLoginRequest = Static<typeof PasswordLoginRequestSchema>;

export const PasswordLoginErrorResponseSchema = Type.Object(
  {
    error: Type.Union([
      Type.Literal('invalid_credentials'),
      Type.Literal('rate_limited'),
      Type.Literal('service_unavailable'),
    ]),
  },
  { additionalProperties: false },
);
export type PasswordLoginErrorResponse = Static<typeof PasswordLoginErrorResponseSchema>;

export const OidcStartRequestSchema = Type.Object(
  {
    returnTo: Type.Optional(Type.String({ minLength: 1, maxLength: OIDC_RETURN_TO_MAX_LENGTH })),
  },
  { additionalProperties: false },
);
export type OidcStartRequest = Static<typeof OidcStartRequestSchema>;

export const OidcStartSuccessResponseSchema = Type.Object(
  {
    authorizationUrl: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type OidcStartSuccessResponse = Static<typeof OidcStartSuccessResponseSchema>;

export const OidcStartErrorResponseSchema = Type.Object(
  {
    error: Type.Union([
      Type.Literal('invalid_return_to'),
      Type.Literal('rate_limited'),
      Type.Literal('provider_unavailable'),
      Type.Literal('service_unavailable'),
    ]),
  },
  { additionalProperties: false },
);
export type OidcStartErrorResponse = Static<typeof OidcStartErrorResponseSchema>;

export const OidcCallbackErrorCodeSchema = Type.Union([
  Type.Literal('provider_unavailable'),
  Type.Literal('invalid_oidc_transaction'),
  Type.Literal('oidc_authentication_failed'),
  Type.Literal('identity_not_allowed'),
  Type.Literal('service_unavailable'),
]);
export type OidcCallbackErrorCode = Static<typeof OidcCallbackErrorCodeSchema>;

export const OidcCallbackErrorResponseSchema = Type.Object(
  {
    error: OidcCallbackErrorCodeSchema,
  },
  { additionalProperties: false },
);
export type OidcCallbackErrorResponse = Static<typeof OidcCallbackErrorResponseSchema>;

/*
 * Owner credential and device pairing (D21). An owner route (every non-GET `/api` route except the
 * login, logout and pairing request/redeem routes) needs an owner credential: under required
 * authentication the authenticated session, otherwise a paired device's `HttpOnly`,
 * `SameSite=Strict` cookie. No request body ever names an owner, actor or claim: every schema here
 * is closed.
 */

/** Pairing codes: 8 characters of an alphabet without look-alikes; input may group them with `-`. */
export const PAIRING_CODE_LENGTH = 8;
export const PAIRING_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PairingCodeInputSchema = Type.String({ minLength: 1, maxLength: 32 });
const PairingIdSchema = Type.String({ minLength: 1, maxLength: 64, pattern: '^[0-9a-f-]+$' });
const PairingTokenSchema = Type.String({
  minLength: 1,
  maxLength: 128,
  pattern: '^[A-Za-z0-9_-]+$',
});
const TimestampSchema = Type.String({ minLength: 1, maxLength: 64 });

/** Where a pairing came from, as the Runtime saw it (the peer address, never a forwarded header). */
export const PairingOriginSchema = Type.Object(
  {
    address: Type.String({ maxLength: 64 }),
    userAgent: Type.Optional(Type.String({ maxLength: 256 })),
  },
  { additionalProperties: false },
);
export type PairingOrigin = Static<typeof PairingOriginSchema>;

export const PairedDeviceSchema = Type.Object(
  {
    id: PairingIdSchema,
    /** A label from the browser's user agent at pairing time. */
    label: Type.String({ maxLength: 256 }),
    pairedAt: TimestampSchema,
    pairedWith: Type.Union([
      Type.Literal('pairing-code'),
      Type.Literal('qr-token'),
      Type.Literal('initial-code'),
    ]),
    origin: PairingOriginSchema,
    /** The device of the browser that sent this request. */
    current: Type.Boolean(),
  },
  { additionalProperties: false },
);
export type PairedDevice = Static<typeof PairedDeviceSchema>;

export const PairedDeviceListResponseSchema = Type.Object(
  { devices: Type.Array(PairedDeviceSchema) },
  { additionalProperties: false },
);
export type PairedDeviceListResponse = Static<typeof PairedDeviceListResponseSchema>;

/**
 * `GET /api/auth/device`: whether this browser holds an owner credential, read before the app so
 * the UI can show "Pair this device".
 * - `not-required`: the demo Runtime (no route needs an owner credential);
 * - `session`: authentication is required and the session is the credential (`present`);
 * - `device`: trusted local mode; this browser's paired device, or the facts the pairing screen
 *   explains: whether any device is paired yet and where the initial pairing code went
 *   (`console`: the Runtime's console; `file`: an owner-only file in the Runtime's local state,
 *   whose path an unpaired page never sees).
 */
export const OwnerCredentialStatusSchema = Type.Union([
  Type.Object({ kind: Type.Literal('not-required') }, { additionalProperties: false }),
  Type.Object(
    { kind: Type.Literal('session'), present: Type.Boolean() },
    { additionalProperties: false },
  ),
  Type.Object(
    { kind: Type.Literal('device'), present: Type.Literal(true), device: PairedDeviceSchema },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      kind: Type.Literal('device'),
      present: Type.Literal(false),
      anyDevicePaired: Type.Boolean(),
      initialCode: Type.Union([
        Type.Literal('none'),
        Type.Literal('console'),
        Type.Literal('file'),
      ]),
    },
    { additionalProperties: false },
  ),
]);
export type OwnerCredentialStatus = Static<typeof OwnerCredentialStatusSchema>;

/** `201` of `POST /api/auth/pairing`: the code this browser shows; a cookie binds the request to it. */
export const PairingRequestCreatedSchema = Type.Object(
  {
    id: PairingIdSchema,
    code: Type.String({ minLength: PAIRING_CODE_LENGTH, maxLength: PAIRING_CODE_LENGTH }),
    expiresAt: TimestampSchema,
    origin: PairingOriginSchema,
  },
  { additionalProperties: false },
);
export type PairingRequestCreated = Static<typeof PairingRequestCreatedSchema>;

export const PairingRequestStatusSchema = Type.Object(
  {
    id: PairingIdSchema,
    /** An expired request is gone (`404`): the browser knows `expiresAt`. */
    status: Type.Union([Type.Literal('pending'), Type.Literal('approved')]),
    expiresAt: TimestampSchema,
    origin: PairingOriginSchema,
  },
  { additionalProperties: false },
);
export type PairingRequestStatus = Static<typeof PairingRequestStatusSchema>;

/** Approval step one: look up the code another browser shows. */
export const PairingLookupRequestSchema = Type.Object(
  { code: PairingCodeInputSchema },
  { additionalProperties: false },
);
export type PairingLookupRequest = Static<typeof PairingLookupRequestSchema>;

/**
 * `200` of a lookup: where the request came from and when, so the owner approves only a request
 * shown on a device they hold; `lookup` confirms it (single use, bound to this device).
 */
export const PairingLookupSchema = Type.Object(
  {
    lookup: PairingTokenSchema,
    id: PairingIdSchema,
    origin: PairingOriginSchema,
    requestedAt: TimestampSchema,
    expiresAt: TimestampSchema,
  },
  { additionalProperties: false },
);
export type PairingLookup = Static<typeof PairingLookupSchema>;

/** Approval step two: confirm the lookup this device made. */
export const PairingApproveRequestSchema = Type.Object(
  { lookup: PairingTokenSchema },
  { additionalProperties: false },
);
export type PairingApproveRequest = Static<typeof PairingApproveRequestSchema>;

/** `200` of an approval: the request it approved, so the owner sees where it came from. */
export const PairingApprovedSchema = Type.Object(
  { id: PairingIdSchema, origin: PairingOriginSchema, approvedAt: TimestampSchema },
  { additionalProperties: false },
);
export type PairingApproved = Static<typeof PairingApprovedSchema>;

/** `200` of `DELETE /api/auth/pairing/requests`: how many pending requests were cleared. */
export const PairingRequestsClearedSchema = Type.Object(
  { cleared: Type.Integer({ minimum: 0 }) },
  { additionalProperties: false },
);
export type PairingRequestsCleared = Static<typeof PairingRequestsClearedSchema>;

/**
 * `200` of `DELETE /api/auth/pairing/initial-code`: the waiting initial code is cancelled and no
 * longer pairs a device. `fileRemoved` is false when a headless code file could not be deleted
 * (the code is spent regardless; the file is removed by hand).
 */
export const InitialCodeCancelledSchema = Type.Object(
  { cancelled: Type.Boolean(), fileRemoved: Type.Boolean() },
  { additionalProperties: false },
);
export type InitialCodeCancelled = Static<typeof InitialCodeCancelledSchema>;

/** `201` of `POST /api/auth/pairing/qr`: a one-time pairing token for a QR code. */
export const PairingQrTokenSchema = Type.Object(
  { token: PairingTokenSchema, expiresAt: TimestampSchema },
  { additionalProperties: false },
);
export type PairingQrToken = Static<typeof PairingQrTokenSchema>;

/**
 * `POST /api/auth/pairing/redeem`: turns this browser's approved request, a QR token or the initial
 * pairing code into this browser's device credential (a cookie, never in the body).
 */
export const PairingRedeemRequestSchema = Type.Union([
  Type.Object(
    { kind: Type.Literal('pairing-request'), id: PairingIdSchema },
    { additionalProperties: false },
  ),
  Type.Object(
    { kind: Type.Literal('qr-token'), token: PairingTokenSchema },
    { additionalProperties: false },
  ),
  Type.Object(
    { kind: Type.Literal('initial-code'), code: PairingCodeInputSchema },
    { additionalProperties: false },
  ),
]);
export type PairingRedeemRequest = Static<typeof PairingRedeemRequestSchema>;

export const PairingRedeemedSchema = Type.Object(
  { device: PairedDeviceSchema },
  { additionalProperties: false },
);
export type PairingRedeemed = Static<typeof PairingRedeemedSchema>;

export const DevicePairingErrorCodeSchema = Type.Union([
  /** Authentication is required: the session is the credential, there is nothing to pair. */
  Type.Literal('pairing_not_used'),
  /** Unknown, expired, already redeemed, or not started by this browser. */
  Type.Literal('pairing_not_found'),
  /** This browser's request is not approved yet. */
  Type.Literal('pairing_not_approved'),
  /** No pending request has this code: never started, expired or already approved. */
  Type.Literal('pairing_code_invalid'),
  /** No open lookup of this device has this value: unknown, used, expired or revoked. */
  Type.Literal('pairing_lookup_invalid'),
  /** The QR token or initial code is not valid: unknown, expired or used. */
  Type.Literal('pairing_secret_invalid'),
  /** Too many pending requests, tokens or paired devices. */
  Type.Literal('pairing_capacity'),
  /** The device to revoke is not paired. */
  Type.Literal('device_not_found'),
]);
export type DevicePairingErrorCode = Static<typeof DevicePairingErrorCodeSchema>;

export const DevicePairingErrorResponseSchema = Type.Object(
  { error: DevicePairingErrorCodeSchema },
  { $id: 'DevicePairingErrorResponse', additionalProperties: false },
);
export type DevicePairingErrorResponse = Static<typeof DevicePairingErrorResponseSchema>;

/** Header every owner request carries: a page of another origin cannot send it without CORS. */
export const OWNER_REQUEST_HEADER = 'x-nevo-owner';

/**
 * `403` of the Runtime's owner-credential guard, written before the route:
 * - `owner_credential_required`: trusted local mode, no paired device's credential;
 * - `owner_request_refused`: not a same-origin owner request (`Origin` or `Sec-Fetch-Site` of
 *   another site or origin, or no `X-Nevo-Owner` header).
 */
export const OwnerCredentialErrorResponseSchema = Type.Object(
  {
    error: Type.Union([
      Type.Literal('owner_credential_required'),
      Type.Literal('owner_request_refused'),
    ]),
  },
  { $id: 'OwnerCredentialErrorResponse', additionalProperties: false },
);
export type OwnerCredentialErrorResponse = Static<typeof OwnerCredentialErrorResponseSchema>;
