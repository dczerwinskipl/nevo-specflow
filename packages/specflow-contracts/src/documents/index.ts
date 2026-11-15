import { Type } from 'typebox';

import { SpecIdSchema } from '../identifiers';
import { IdSchema } from './vocabulary';

export * from '../identifiers';
export * from './catalogue';
export * from './definition';
export * from './definition-files';
export * from './errors';
export * from './operations';
export * from './task-resource-files';
export * from './tree';
export * from './uncommitted';
export * from './vocabulary';
export * from './workflow-definition-files';

export const SpecificationDocumentParamsSchema = Type.Object(
  { specId: SpecIdSchema, documentId: IdSchema },
  { additionalProperties: false },
);
export const DocumentQuerySchema = Type.Object(
  { revision: Type.Optional(Type.String({ minLength: 1, maxLength: 1000 })) },
  { additionalProperties: false },
);
