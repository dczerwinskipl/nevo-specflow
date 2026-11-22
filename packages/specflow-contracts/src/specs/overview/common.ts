import { Type, type Static } from 'typebox';

export const SpecsCollectionSchema = Type.Union(
  [Type.Literal('current'), Type.Literal('archive')],
  {
    description:
      'Select Current (default) or Archive; unknown and additional query parameters are rejected.',
  },
);
export type SpecsCollection = Static<typeof SpecsCollectionSchema>;

export const SpecOverviewItemSchema = Type.Object({
  id: Type.String(),
  title: Type.String(),
  key: Type.Optional(Type.String()),
  pullRequests: Type.Optional(
    Type.Array(Type.Object({ number: Type.Integer(), url: Type.String() })),
  ),
  tags: Type.Optional(Type.Array(Type.String())),
  updatedAt: Type.String(),
  // Null means progress was not projected, not zero completed tasks.
  progress: Type.Union(
    [
      Type.Object({
        completed: Type.Integer({ minimum: 0 }),
        total: Type.Integer({ minimum: 0 }),
      }),
      Type.Null(),
    ],
    {
      description:
        'Task progress: null means unavailable/unknown, not zero completed Tasks. A real empty Task set is completed=0 and total=0.',
    },
  ),
});
export type SpecOverviewItem = Static<typeof SpecOverviewItemSchema>;

export const SpecsOverviewQuerySchema = Type.Object(
  { collection: Type.Optional(SpecsCollectionSchema) },
  { additionalProperties: false },
);
