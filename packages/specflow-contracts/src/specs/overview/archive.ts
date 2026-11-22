import { Type, type Static } from 'typebox';

import { SpecOverviewItemSchema } from './common';

export const ArchivedSpecOverviewItemSchema = Type.Object(
  {
    ...SpecOverviewItemSchema.properties,
    completedAt: Type.Optional(Type.String({ description: 'Authoritative completion timestamp when known; never derive it from updatedAt.' })),
    archivedAt: Type.Optional(Type.String({ description: 'Authoritative archive timestamp when known; never derive it from updatedAt.' })),
  },
  { additionalProperties: false },
);
export type ArchivedSpecOverviewItem = Static<typeof ArchivedSpecOverviewItemSchema>;

export const ArchiveSpecsOverviewSchema = Type.Object(
  {
    revision: Type.String(),
    collection: Type.Literal('archive'),
    items: Type.Array(ArchivedSpecOverviewItemSchema, { description: 'Historical Specification records after per-item spec.view filtering. Archive has no Current classification, signals, sections or current executions.' }),
  },
  { additionalProperties: false },
);
export type ArchiveSpecsOverview = Static<typeof ArchiveSpecsOverviewSchema>;
