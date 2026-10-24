import { createHash } from 'node:crypto';

import { serializeSpecificationManifest } from './manifest-serializer';
import {
  SpecificationError,
  isExplicitSpecificationSlug,
  isValidSpecificationId,
  specificationSlugFromTitle,
  validateSpecificationScaffoldInput,
  type SpecificationManifest,
} from './model';

export interface SpecificationScaffoldInput {
  readonly specId: string;
  readonly title: string;
  /** An explicit creation date supplied by the application operation. */
  readonly created: string;
  readonly goal?: string;
  /** Explicit, already validated slug; omitted: derived from the title. */
  readonly slug?: string;
}

export interface SpecificationScaffoldFile {
  readonly relativePath: string;
  readonly content: string;
  /** Baseline for later admission of known Engine-created dirty files (SC00). */
  readonly sha256: string;
}

export interface SpecificationScaffold {
  readonly specId: string;
  readonly slug: string;
  readonly files: readonly SpecificationScaffoldFile[];
}

/**
 * Deterministic, side-effect-free scaffold. It does not reserve an ID, create files, update a
 * registry or regenerate indexes.
 */
export function createSpecificationScaffold(
  input: SpecificationScaffoldInput,
): SpecificationScaffold {
  if (!isValidSpecificationId(input.specId)) {
    throw new SpecificationError('SPEC_VALIDATION_ERROR', 'A canonical specId is required.');
  }
  validateSpecificationScaffoldInput(input);
  const title = input.title.replace(/\s+/gu, ' ').trim();
  if (input.slug !== undefined && !isExplicitSpecificationSlug(input.slug)) {
    throw new SpecificationError(
      'SPEC_VALIDATION_ERROR',
      'Specification slug must be lowercase kebab-case ASCII of at most 80 characters.',
    );
  }
  const slug = input.slug ?? specificationSlugFromTitle(title, input.specId);
  const base = 'specs/active/' + slug + '/';
  const model: SpecificationManifest = {
    specId: input.specId,
    slug,
    title,
    archetype: {
      id: 'minimal',
      version: 1,
      requirements: [{ documentType: 'overview', minCount: 1 }],
    },
    documents: [{ id: 'overview', path: 'overview.md', type: 'overview' }],
    folders: [],
    status: 'draft',
    location: 'active',
    priority: 10,
    created: input.created,
    tasks: [],
  };
  const manifest = serializeSpecificationManifest(model);
  const goal = input.goal?.trim();
  const overview = [
    '---',
    'id: spec.' + slug,
    'type: change',
    'title: ' + JSON.stringify(title),
    'status: draft',
    'change: ' + slug,
    '---',
    '',
    '# ' + title,
    '',
    '## Context',
    '',
    '## Goal',
    '',
    '<!-- Initial goal captured when this specification was created; refine or rewrite it freely. -->',
    '',
    goal?.length ? goal : 'Describe the intended outcome of this specification.',
    '',
    '## Non-goals',
    '',
    '## Constraints',
    '',
    '## Affected Areas',
    '',
    '## Acceptance Criteria & Verification',
    '',
  ].join('\n');

  return {
    specId: input.specId,
    slug,
    files: [
      fingerprint(base + 'specification.yaml', manifest),
      fingerprint(base + 'overview.md', overview),
    ],
  };
}

function fingerprint(relativePath: string, content: string): SpecificationScaffoldFile {
  return {
    relativePath,
    content,
    sha256: createHash('sha256').update(content, 'utf8').digest('hex'),
  };
}
