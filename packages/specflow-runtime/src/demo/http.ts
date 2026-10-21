import { Type } from 'typebox';
import { DemoCreateErrorSchema, DemoErrorSchema } from '@nevo/specflow-contracts/demo';
import { DemoOperationError } from './state';

/** HTTP building blocks shared by the demo endpoints of every feature module. */
export const DemoId = Type.String({
  minLength: 1,
  maxLength: 200,
  pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]*$',
});
export const DemoSpecParams = Type.Object({ specId: DemoId });
// Demo-only bounded ingest: 10 × 200k UTF-16 units, including worst-case JSON escaping.
export const DEMO_DOCUMENT_BATCH_BODY_LIMIT = 16 * 1024 * 1024;
export const DEMO_DOCUMENT_SAVE_BODY_LIMIT = 2 * 1024 * 1024;

export const demoErrors = {
  400: Type.Union([
    DemoErrorSchema,
    Type.Object({
      statusCode: Type.Literal(400),
      error: Type.Literal('Bad Request'),
      message: Type.String(),
    }),
  ]),
  404: DemoErrorSchema,
  409: DemoErrorSchema,
  503: DemoErrorSchema,
};

export const demoCreateErrors = {
  400: Type.Union([
    DemoCreateErrorSchema,
    DemoErrorSchema,
    Type.Object({
      statusCode: Type.Literal(400),
      error: Type.Literal('Bad Request'),
      message: Type.String(),
    }),
  ]),
  // The global authorization handler answers `{ error: 'forbidden' }` (no code).
  403: Type.Union([DemoCreateErrorSchema, Type.Object({ error: Type.String() })]),
  404: DemoErrorSchema,
  409: Type.Union([DemoCreateErrorSchema, DemoErrorSchema]),
  422: DemoCreateErrorSchema,
  503: Type.Union([DemoCreateErrorSchema, DemoErrorSchema]),
};

export function isDemoOperationError(error: unknown): error is DemoOperationError {
  return error instanceof DemoOperationError;
}
