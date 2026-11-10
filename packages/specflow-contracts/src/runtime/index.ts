import { Type, type Static } from 'typebox';

export const RuntimeInfoResponseSchema = Type.Object({
  dataMode: Type.Union([Type.Literal('project'), Type.Literal('demo')]),
});
export type RuntimeInfoResponse = Static<typeof RuntimeInfoResponseSchema>;

/**
 * The body of a request refused by the Runtime default rate limit (the endpoint policy). A route
 * without a `429` schema of its own also answers the limiter's `statusCode`.
 */
export const RateLimitedErrorResponseSchema = Type.Object(
  { error: Type.Literal('rate_limited'), statusCode: Type.Optional(Type.Literal(429)) },
  { $id: 'RateLimitedErrorResponse', additionalProperties: false },
);
export type RateLimitedErrorResponse = Static<typeof RateLimitedErrorResponseSchema>;

/**
 * The body of a request the framework refuses while reading it, before the route runs: a malformed
 * or empty JSON body (`400`, `FST_ERR_CTP_INVALID_JSON_BODY`, `FST_ERR_CTP_EMPTY_JSON_BODY`) or an
 * unsupported media type (`415`, `FST_ERR_CTP_INVALID_MEDIA_TYPE`). Fastify's own error body.
 */
export const RequestParsingErrorResponseSchema = Type.Object(
  {
    statusCode: Type.Integer({ minimum: 400, maximum: 499 }),
    code: Type.String(),
    error: Type.String(),
    message: Type.String(),
  },
  { $id: 'RequestParsingErrorResponse', additionalProperties: false },
);
export type RequestParsingErrorResponse = Static<typeof RequestParsingErrorResponseSchema>;
