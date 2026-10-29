import { readCanonicalSpecSources, type SpecFlowEngine } from '@nevo/specflow-engine';

import { SpecsReadError } from '../read/error';
import type { SourceSection, SpecificationWorkspaceRepository } from './repository';

const notImplemented = {
  state: 'unavailable',
  reason: 'not_implemented',
} as const satisfies SourceSection<never>;

/**
 * Workspace identity of a specification read from its Engine-verified canonical manifest.
 *
 * The Engine owns the manifest (title, task list) and its provenance; it does not yet own a
 * verified projection of Git state, activity, tasks, documents or Sessions. Those sections are
 * therefore `not_implemented` rather than guessed or reported as an empty success, and no action
 * is available. An unknown `specId` is `null` (404), distinct from a bound but unreadable
 * source (a typed error the endpoint answers with 503).
 */
export function createEngineWorkspaceRepository(
  engine: SpecFlowEngine,
): SpecificationWorkspaceRepository {
  return {
    async readSpecification(specId) {
      const sources = await readCanonicalSpecSources(engine, (candidate) => candidate === specId);
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
          // The Engine reads no summary text; an invented one would be a false fact.
          summary: '',
          // A manifest without tasks has not been prepared for work yet.
          preparationState: source.specification.tasks.length === 0 ? 'empty' : 'prepared',
          attention: [],
        },
        sections: {
          activity: notImplemented,
          repository: notImplemented,
          changes: notImplemented,
        },
        actions: {
          executeTasks: { available: false, reason: 'not_implemented' },
          startSession: { available: false, reason: 'not_implemented' },
        },
      };
    },
  };
}
