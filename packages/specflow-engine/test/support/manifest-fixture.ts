import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { stringify } from 'yaml';

import { serializeSpecificationManifest } from '../../src/testing';

export interface ManifestFixtureInput {
  readonly slug: string;
  readonly location?: 'active' | 'archive';
  readonly specId?: string;
  readonly title?: string;
  readonly archetypeId?: string;
  readonly documents?: readonly { id: string; path: string; type: string }[];
  readonly folders?: readonly string[];
  /** Unknown top-level keys to preserve. */
  readonly extra?: Readonly<Record<string, unknown>>;
}

export interface WrittenManifestFixture {
  readonly specId: string;
  readonly relativeManifestPath: string;
}

/**
 * Write a hand-built, valid manifest in the CURRENT shape (`archetype` plus `documents`) to
 * `<root>/specs/<location>/<slug>/specification.yaml`. Tests that need a Specification directory
 * without running Create use this instead of spelling YAML by hand.
 */
export async function writeSpecificationManifestFixture(
  root: string,
  input: ManifestFixtureInput,
): Promise<WrittenManifestFixture> {
  const specId = input.specId ?? randomUUID();
  const location = input.location ?? 'active';
  const content = serializeSpecificationManifest(
    {
      specId,
      slug: input.slug,
      title: input.title ?? 'Fixture ' + input.slug,
      archetype: {
        id: input.archetypeId ?? 'minimal',
        version: 1,
        requirements: [{ documentType: 'overview', minCount: 1 }],
      },
      documents: input.documents ?? [{ id: 'overview', path: 'overview.md', type: 'overview' }],
      folders: input.folders ?? [],
      status: 'draft',
      location,
      priority: 10,
      created: '2026-10-14',
      tasks: [],
    },
    input.extra,
  );

  return await writeRaw(root, input.slug, location, specId, content);
}

/** Write the OLD shape (`type`, no `archetype`/`documents`) to prove that it is rejected. */
export async function writeOldShapeManifestFixture(
  root: string,
  slug: string,
  location: 'active' | 'archive' = 'active',
): Promise<WrittenManifestFixture> {
  const specId = randomUUID();
  const content = stringify({
    id: slug,
    title: 'Old shape ' + slug,
    type: 'legacy',
    status: 'draft',
    priority: 10,
    created: '2026-10-14',
    tasks: [],
    spec_id: specId,
  });

  return await writeRaw(root, slug, location, specId, content);
}

async function writeRaw(
  root: string,
  slug: string,
  location: string,
  specId: string,
  content: string,
): Promise<WrittenManifestFixture> {
  const relativeManifestPath = `specs/${location}/${slug}/specification.yaml`;
  const absolute = join(root, relativeManifestPath);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content, 'utf8');

  return { specId, relativeManifestPath };
}
