import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import {
  ArchetypeCatalogueSchema,
  CreateDocumentsInputSchema,
  DocumentContentSchema,
  DocumentErrorSchema,
  DocumentOperationInputSchema,
  DocumentOperationResultSchema,
  DocumentTreeSchema,
  SaveInputSchema,
  SaveResultSchema,
  type ArchetypeCatalogue,
} from '../documents';
import {
  CreateSpecRequestSchema,
  CreatedSpecSchema,
  ExistingSpecTargetSchema,
  NewSpecWorktreeTargetSchema,
} from '../specs/create';
import { CreateOptionsSchema } from '../specs/create-options';
import {
  DemoArchetypeCatalogueSchema,
  DemoCatalogueSchema,
  DemoCreateDocumentsInputSchema,
  DemoCreateInputSchema,
  DemoCreateOptionsSchema,
  DemoCreateResultSchema,
  DemoCreateTargetSchema,
  DemoDocumentContentSchema,
  DemoDocumentErrorSchema,
  DemoDocumentOperationInputSchema,
  DemoDocumentOperationResultSchema,
  DemoDocumentTreeSchema,
  DemoExistingTargetSchema,
  DemoNewWorktreeTargetSchema,
  DemoSaveInputSchema,
  DemoSaveResultSchema,
} from './index';

const ID = '0b8f1c1e-0a11-4c6e-9a01-000000000001';

describe('demo create contract equals the real create contract', () => {
  it('derives the demo options and target schemas from the real ones (no hand copy)', () => {
    expect(JSON.stringify(DemoCreateOptionsSchema)).toBe(JSON.stringify(CreateOptionsSchema));
    expect(JSON.stringify(DemoExistingTargetSchema)).toBe(JSON.stringify(ExistingSpecTargetSchema));
    expect(JSON.stringify(DemoNewWorktreeTargetSchema)).toBe(
      JSON.stringify(NewSpecWorktreeTargetSchema),
    );
  });

  it('accepts the same documents in both directions', () => {
    const options = {
      primaryWorkspaceId: ID,
      workspaces: [
        {
          workspaceId: ID,
          kind: 'primary',
          name: 'repo',
          path: '/work/repo',
          managed: false,
          specCount: 0,
          state: 'available',
          selectable: true,
          branch: 'develop',
        },
      ],
      newWorktree: { status: 'available', branchProtected: true },
      defaultBaseRef: 'develop',
      branchPattern: 'feature/{slug}',
      worktreesRoot: { path: '/work/repo-worktrees', exists: true },
      commits: { protectedBranches: ['main'], allowedBranches: ['feature/**'] },
      baseRefs: [{ ref: 'develop', checkedOutWorkspaceId: ID }],
    };
    expect(Value.Check(CreateOptionsSchema, options)).toBe(true);
    expect(Value.Check(DemoCreateOptionsSchema, options)).toBe(true);
    const extra = { ...options, surprise: 1 };
    expect(Value.Check(CreateOptionsSchema, extra)).toBe(false);
    expect(Value.Check(DemoCreateOptionsSchema, extra)).toBe(false);
    for (const target of [
      { kind: 'existing', workspaceId: ID },
      { kind: 'new-worktree', baseRef: 'x', branch: 'y', integrationTargetWorkspaceId: ID },
    ]) {
      expect(Value.Check(DemoCreateTargetSchema, target)).toBe(true);
    }
  });
});

const catalogue: ArchetypeCatalogue = {
  revision: 'r1',
  documentTypes: [
    {
      id: 'overview',
      title: 'Overview',
      description: 'd',
      useWhen: 'u',
      instructions: 'i',
      defaultFilename: 'overview.md',
    },
  ],
  archetypes: [
    {
      id: 'minimal',
      version: 1,
      title: 'Minimal',
      description: 'd',
      useWhen: 'u',
      requirements: [{ documentType: 'overview', minCount: 1 }],
      documents: [
        {
          id: 'overview',
          type: 'overview',
          title: 'Overview',
          filename: 'overview.md',
          include: 'always',
          content: '# {{specificationTitle}}',
        },
      ],
    },
  ],
};

describe('demo documents contract equals the real documents contract', () => {
  it('re-exports the real document schemas under demo names (no hand copy)', () => {
    expect(DemoArchetypeCatalogueSchema).toBe(ArchetypeCatalogueSchema);
    expect(DemoDocumentTreeSchema).toBe(DocumentTreeSchema);
    expect(DemoDocumentContentSchema).toBe(DocumentContentSchema);
    expect(DemoDocumentErrorSchema).toBe(DocumentErrorSchema);
    expect(DemoSaveInputSchema).toBe(SaveInputSchema);
    expect(DemoSaveResultSchema).toBe(SaveResultSchema);
    expect(DemoDocumentOperationInputSchema).toBe(DocumentOperationInputSchema);
    expect(DemoDocumentOperationResultSchema).toBe(DocumentOperationResultSchema);
    expect(DemoCreateDocumentsInputSchema).toBe(CreateDocumentsInputSchema);
  });

  it('keeps every catalogue property schema and adds only the demo-only part', () => {
    for (const [key, schema] of Object.entries(ArchetypeCatalogueSchema.properties))
      expect(
        DemoCatalogueSchema.properties[key as keyof typeof DemoCatalogueSchema.properties],
      ).toBe(schema);
    const demoOnly = Object.keys(DemoCatalogueSchema.properties).filter(
      (key) => !(key in ArchetypeCatalogueSchema.properties),
    );
    expect(demoOnly.sort()).toEqual(['currentLocation', 'demo', 'project', 'providers']);
    const demo = {
      ...catalogue,
      demo: true,
      project: { id: 'p', title: 'P' },
      currentLocation: { kind: 'current', path: '/p', branch: 'main', simulated: false },
      providers: [],
    };
    expect(Value.Check(DemoCatalogueSchema, demo)).toBe(true);
    const {
      demo: _demo,
      project: _project,
      currentLocation: _location,
      providers: _providers,
      ...real
    } = demo;
    expect(Value.Check(ArchetypeCatalogueSchema, real)).toBe(true);
    // A string version (the obsolete demo shape) is refused by both.
    const stringVersion = {
      ...demo,
      archetypes: demo.archetypes.map((archetype) => ({ ...archetype, version: '1' })),
    };
    expect(Value.Check(DemoCatalogueSchema, stringVersion)).toBe(false);
  });

  it('accepts the real Create request (operationId required) and answers the real result fields', () => {
    for (const [key, schema] of Object.entries(CreateSpecRequestSchema.properties))
      if (key !== 'operationId')
        expect(
          DemoCreateInputSchema.properties[key as keyof typeof DemoCreateInputSchema.properties],
        ).toBe(schema);
    const request = {
      operationId: ID,
      title: 'T',
      archetypeId: 'minimal',
      archetypeVersion: 1,
      catalogueRevision: 'r1',
      optionalDocumentIds: [],
      addedDocuments: [{ path: 'notes/a.md', content: 'A' }],
      folders: ['notes'],
    };
    expect(Value.Check(CreateSpecRequestSchema, request)).toBe(true);
    expect(Value.Check(DemoCreateInputSchema, request)).toBe(true);
    const { operationId: _operationId, ...withoutId } = request;
    expect(Value.Check(CreateSpecRequestSchema, withoutId)).toBe(true);
    expect(Value.Check(DemoCreateInputSchema, withoutId)).toBe(false);
    expect(
      Value.Check(DemoCreateInputSchema, {
        ...request,
        addedDocuments: [{ path: 'a.md', title: 'A', content: 'A' }],
      }),
    ).toBe(false);
    expect(Object.keys(DemoCreateResultSchema.properties).sort()).toEqual(
      Object.keys(CreatedSpecSchema.properties).sort(),
    );
  });
});
