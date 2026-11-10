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
