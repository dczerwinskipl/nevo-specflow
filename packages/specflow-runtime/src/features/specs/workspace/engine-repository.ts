import { readCanonicalSpecSources, type SpecFlowEngine } from '@nevo/specflow-engine';

import { SpecsReadError } from '../read/error';
import { OVERVIEW_SUMMARY_PREFIX_BYTES, summarizeOverview } from './overview-summary';
import type { SourceSection, SpecificationWorkspaceRepository } from './repository';

const notImplemented = {
  state: 'unavailable',
  reason: 'not_implemented',
} as const satisfies SourceSection<never>;

/**
 * Workspace identity of a specification read from its Engine-verified canonical manifest.
 *
 * The Engine owns the manifest (title, task list, creation date) and its provenance; it does not yet
 * own a verified projection of Git state, so Repository and Changes are `not_implemented` rather
 * than guessed. Tasks, documents, Sessions, activity and the `startSession` action come from owner
 * contributions. The description is the overview's first paragraph as plain text, read as a bounded
 * prefix within the same canonical read; any overview problem is `''`, never a failed read, and the
 * `revision` stays the manifest's (an overview-only change does not change it). An unknown `specId`
 * is `null` (404), distinct from a bound but unreadable source (a typed error answered with 503).
 */
export function createEngineWorkspaceRepository(
  engine: SpecFlowEngine,
): SpecificationWorkspaceRepository {
  return {
    async readSpecification(specId) {
      const sources = await readCanonicalSpecSources(engine, (candidate) => candidate === specId, {
        overviewPrefixBytes: OVERVIEW_SUMMARY_PREFIX_BYTES,
      });
      const source = sources.find((item) => item.specId === specId);
      if (!source) {
        return null;
      }

      if (source.status === 'workspace_unavailable') {
        throw new SpecsReadError(
          'SPEC_WORKSPACE_UNAVAILABLE',
          'The specification workspace is unavailable.',
        );
      }

      if (source.status === 'manifest_missing') {
        throw new SpecsReadError('SPEC_MANIFEST_MISSING', 'The specification manifest is missing.');
      }

      return {
        revision: source.sourceRevision,
        specification: {
          id: source.specId,
          title: source.specification.title,
          summary: source.overviewPrefix ? summarizeOverview(source.overviewPrefix) : '',
          // The manifest lists no Tasks: the Tasks contribution (the Engine's Task resources)
          // replaces this with the state they imply; without it nothing verifies a preparation.
          preparationState: 'empty',
          attention: [],
        },
        ...(source.specification.created !== undefined
          ? { created: source.specification.created }
          : {}),
        sections: {
          repository: notImplemented,
          changes: notImplemented,
        },
        actions: {
          // The Session association contribution decides; without one there are no Sessions.
          startSession: { available: false, reason: 'sessions_disabled' },
        },
      };
    },
  };
}
