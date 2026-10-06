import {
  IDENTIFIER_SEGMENT_PATTERN,
  SCOPE_VALUE_PATTERN,
  type ResourceDefinition,
} from '@nevo/authorization';
import { Type, type Static, type TBoolean, type TObject } from 'typebox';

type ResourceAction<R extends ResourceDefinition> = R['actions'][keyof R['actions']] & string;

export type CapabilityProjection<R extends ResourceDefinition> = Readonly<
  Record<ResourceAction<R>, boolean>
>;

type CapabilityProjectionProperties<R extends ResourceDefinition> = Record<
  keyof CapabilityProjection<R> & string,
  TBoolean
>;

export type WithCapabilities<
  T,
  Resources extends Readonly<Record<string, ResourceDefinition>>,
> = T & {
  readonly capabilities: Readonly<{
    [Key in keyof Resources]: CapabilityProjection<Resources[Key]>;
  }>;
};

export function capabilityProjectionSchema<R extends ResourceDefinition>(
  resource: R,
): TObject<CapabilityProjectionProperties<R>> {
  const properties: Record<string, TBoolean> = {};

  for (const action of Object.values(resource.actions)) {
    properties[action] = Type.Boolean();
  }

  return Type.Object(properties, {
    additionalProperties: false,
  }) as TObject<CapabilityProjectionProperties<R>>;
}

export const AuthorizationScopeSchema = Type.Record(
  Type.String({ minLength: 1, pattern: IDENTIFIER_SEGMENT_PATTERN }),
  Type.String({ minLength: 1, pattern: SCOPE_VALUE_PATTERN }),
  { additionalProperties: false },
);
export type AuthorizationScope = Static<typeof AuthorizationScopeSchema>;

export const AuthenticationRequiredErrorResponseSchema = Type.Object(
  { error: Type.Literal('authentication_required') },
  { additionalProperties: false },
);
export type AuthenticationRequiredErrorResponse = Static<
  typeof AuthenticationRequiredErrorResponseSchema
>;

export const AuthorizationForbiddenErrorResponseSchema = Type.Object(
  { error: Type.Literal('forbidden') },
  { additionalProperties: false },
);
export type AuthorizationForbiddenErrorResponse = Static<
  typeof AuthorizationForbiddenErrorResponseSchema
>;

export const AuthorizationErrorResponseSchema = Type.Union([
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
]);
export type AuthorizationErrorResponse = Static<typeof AuthorizationErrorResponseSchema>;
