import { describe, expect, it } from 'vitest';

import { resolveCatalogue } from '../../definitions/resolved-catalogue';
import type { ProjectCatalogue } from '../../definitions/project-catalogue';
import { seedCatalogueForTesting } from '../../definitions/testing-install';
import type { SpecificationManifest } from '../../model';
import { buildSnapshot } from '../changes/test-support';
import { planDocumentChange } from '../changes/plan';
import type { UnresolvedCreateRequest } from '../changes/plan/request';
import { resolveTemplateEntries } from './resolve';

const seed = await seedCatalogueForTesting();

function projectOf(catalogue = seed, invalid: string[] = []): ProjectCatalogue {
  return {
    catalogue,
    problems: [],
    problemsTruncated: false,
    rootPresent: true,
    invalidArchetypeIds: new Set(invalid),
  };
}

const snapshot = buildSnapshot({ files: [{ path: 'overview.md', content: '# O' }] });
const manifest: SpecificationManifest = {
  ...snapshot.manifest,
  title: '  Readable   "quoted" feature ',
  archetype: { id: 'feature', version: 1, requirements: [] },
  created: '2026-10-24',
};

const request = (
  documents: UnresolvedCreateRequest['documents'],
  catalogueRevision: string | null = seed.revision,
): UnresolvedCreateRequest => ({
  action: 'create',
  documents,
  folders: [],
  ...(catalogueRevision !== null ? { catalogueRevision } : {}),
});

function refusal(run: () => unknown): { code: string; details?: unknown } {
  try {
    run();
  } catch (error) {
    return error as { code: string; details?: unknown };
  }

  throw new Error('Expected a refusal.');
}

describe('rendering template entries of an existing Specification', () => {
  it('renders title, slug and created from the manifest and leaves the goal empty', () => {
    const resolved = resolveTemplateEntries(
      manifest,
      request([{ path: 'docs/behaviour.md', templateId: 'behaviour' }]),
      projectOf(),
    );
    expect(resolved.documents).toHaveLength(1);
    const [entry] = resolved.documents;
    expect(entry).toMatchObject({
      path: 'docs/behaviour.md',
      type: 'behaviour',
      templateId: 'behaviour',
    });
    expect(entry?.content).toContain('# Readable "quoted" feature - Behaviour');
    expect(entry?.content).not.toContain('{{');
  });

  it('defaults the path to the template filename and keeps content entries as they are', () => {
    const resolved = resolveTemplateEntries(
      manifest,
      request([{ templateId: 'ux' }, { path: 'free.md', type: 'notes', content: 'text\n' }]),
      projectOf(),
    );
    expect(resolved.documents[0]).toMatchObject({ path: 'ux.md', type: 'ux', templateId: 'ux' });
    expect(resolved.documents[1]).toEqual({ path: 'free.md', type: 'notes', content: 'text\n' });
  });

  it('plans the rendered entries as an ordinary create with the rendering pinned', () => {
    const resolved = resolveTemplateEntries(manifest, request([{ templateId: 'ux' }]), projectOf());
    const { plan } = planDocumentChange(snapshot, resolved);
    expect(plan.templates).toEqual([
      { path: 'ux.md', templateId: 'ux', sha256: plan.documents[0]?.sha256 },
    ]);
    expect(plan.documents[0]).toMatchObject({ path: 'ux.md', type: 'ux' });
  });

  it('refuses an unknown template as ARCHETYPE_UNKNOWN', () => {
    expect(
      refusal(() =>
        resolveTemplateEntries(manifest, request([{ templateId: 'nope' }]), projectOf()),
      ),
    ).toMatchObject({ code: 'ARCHETYPE_UNKNOWN', details: { cause: 'template-unknown' } });
  });

  it('requires the catalogue revision and refuses a stale one', () => {
    expect(
      refusal(() =>
        resolveTemplateEntries(manifest, request([{ templateId: 'ux' }], null), projectOf()),
      ),
    ).toMatchObject({ code: 'DOCUMENT_OPERATION_INVALID' });
    expect(
      refusal(() =>
        resolveTemplateEntries(manifest, request([{ templateId: 'ux' }], 'old'), projectOf()),
      ),
    ).toMatchObject({ code: 'CATALOGUE_STALE' });
  });

  it('refuses a type that is not the template type', () => {
    expect(
      refusal(() =>
        resolveTemplateEntries(
          manifest,
          request([{ templateId: 'ux', type: 'notes' }]),
          projectOf(),
        ),
      ),
    ).toMatchObject({ code: 'DOCUMENT_OPERATION_INVALID' });
  });

  it('refuses when the archetype of the Specification is no longer defined', () => {
    const without = resolveCatalogue({
      documentTypes: seed.documentTypes,
      archetypes: seed.archetypes.filter((archetype) => archetype.id !== 'feature'),
    });
    expect(
      refusal(() =>
        resolveTemplateEntries(
          manifest,
          request([{ templateId: 'ux' }], without.revision),
          projectOf(without),
        ),
      ),
    ).toMatchObject({ code: 'ARCHETYPE_UNKNOWN', details: { cause: 'archetype-not-defined' } });
    expect(
      refusal(() =>
        resolveTemplateEntries(
          manifest,
          request([{ templateId: 'ux' }], without.revision),
          projectOf(without, ['feature']),
        ),
      ),
    ).toMatchObject({ details: { cause: 'archetype-invalid' } });
  });

  it('refuses a project without any archetype as DEFINITIONS_MISSING', () => {
    const empty = resolveCatalogue({ documentTypes: [], archetypes: [] });
    expect(
      refusal(() =>
        resolveTemplateEntries(manifest, request([{ templateId: 'ux' }], 'x'), projectOf(empty)),
      ),
    ).toMatchObject({ code: 'DEFINITIONS_MISSING' });
  });
});
