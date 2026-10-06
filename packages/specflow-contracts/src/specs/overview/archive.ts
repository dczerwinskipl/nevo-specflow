import { Type, type Static } from 'typebox';

import { SpecOverviewItemSchema } from './common';

export const ArchivedSpecOverviewItemSchema = Type.Object(
  {
    ...SpecOverviewItemSchema.properties,
    completedAt: Type.Optional(Type.String()),
    archivedAt: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export type ArchivedSpecOverviewItem = Static<typeof ArchivedSpecOverviewItemSchema>;

export const ArchiveSpecsOverviewSchema = Type.Object(
  {
    revision: Type.String(),
    collection: Type.Literal('archive'),
    items: Type.Array(ArchivedSpecOverviewItemSchema),
  },
  { additionalProperties: false },
);
export type ArchiveSpecsOverview = Static<typeof ArchiveSpecsOverviewSchema>;
