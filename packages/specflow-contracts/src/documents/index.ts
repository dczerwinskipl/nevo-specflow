import { Type } from 'typebox';

import { IdSchema } from './vocabulary';

export * from './catalogue';
export * from './definition';
export * from './definition-files';
export * from './errors';
export * from './operations';
export * from './tree';
export * from './uncommitted';
export * from './vocabulary';

export const SpecificationDocumentParamsSchema = Type.Object(
  { specId: IdSchema, documentId: IdSchema },
  { additionalProperties: false },
);
export const DocumentQuerySchema = Type.Object(
  { revision: Type.Optional(Type.String({ minLength: 1, maxLength: 1000 })) },
  { additionalProperties: false },
);
