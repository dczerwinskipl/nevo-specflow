import type {
  DemoSessionDetail,
  DemoSessionInput,
  DemoSessionResult,
} from '@nevo/specflow-contracts/demo';
import type { DemoSpecification } from '../../demo-catalogue';
import { DemoOperationError, type DemoState } from '../../../demo/state';
import type { SessionReferenceOwner } from '../reference-owner';
import { buildDemoSessionContribution } from './contribution';
import { buildCatalogueSessionDetail } from './seeded-detail';

type Find = (specId: string) => Promise<DemoSpecification | undefined>;

/**
 * Sessions-owned demo operations over the shared demo state: session allocation for a created or
 * seeded specification, seeded session details, the session reference overlay and the workspace
 * sessions section. Document paths for the context snapshot are supplied by the caller.
 */
export function createDemoSessions(state: DemoState) {
  return {
    /** Session context documents are materialized snapshots in this bounded demo; documents report changes here. */
    refreshDocuments(specId: string, paths: readonly string[]) {
      for (const session of state.sessions.values()) {
        if (session.specId === specId) {
          session.context.documents = [...paths];
        }
      }
    },
    allocate(
      subject: string,
      specId: string,
      specification: { title: string; archetype: string; documents: string[] },
      input: DemoSessionInput,
    ): DemoSessionResult {
      state.stale(input.catalogueRevision);
      const provider = state.catalogue.providers.find(
        (p) => p.id === input.providerId && p.available,
      );
      const model = provider?.models.find((m) => m.id === input.modelId);
      if (
        !provider ||
        !model ||
        !model.modes.includes(input.mode) ||
        (input.effort !== undefined && !model.efforts.includes(input.effort))
      ) {
        throw new DemoOperationError(400, 'demo_invalid_selection');
      }

      const entry = state.request(subject, 'session:' + specId, input.requestId, input);
      if (entry.result) {
        return entry.result as DemoSessionResult;
      }

      const location = state.locations.get(specId) ?? state.catalogue.currentLocation;
      state.fail('session', 'demo_session_allocation_failed');
      const sessionId = 'session-' + state.id();
      const detail: DemoSessionDetail = {
        sessionId,
        specId,
        title: 'Spec Writer · ' + provider.title,
        configuration: {
          providerId: provider.id,
          providerTitle: provider.title,
          modelId: model.id,
          modelTitle: model.title,
          ...(input.effort !== undefined ? { effort: input.effort } : {}),
          mode: input.mode,
          profile: 'Spec Writer',
        },
        location: structuredClone(location),
        context: {
          project: state.catalogue.project.title,
          specification: specification.title,
          archetype: specification.archetype,
          documents: [...specification.documents],
          instructions: [
            'Spec Writer demo role',
            'Project instructions are supplied independently of your message.',
          ],
        },
      };
      state.sessions.set(sessionId, detail);
      const result = { sessionId, location: detail.location };
      entry.result = result;

      return result;
    },
    /** Detail of an allocated session, or a read-only detail of a seeded catalogue session. */
    async detail(
      sessionId: string,
      specId: string,
      find: Find,
      documentPaths: (record: DemoSpecification) => string[],
    ) {
      const allocated = state.sessions.get(sessionId);
      if (allocated) {
        return allocated;
      }

      const record = await find(specId);
      const provider = state.catalogue.providers.find((item) => item.available);
      const model = provider?.models[0];

      return record && provider && model
        ? buildCatalogueSessionDetail({
            record,
            sessionId,
            project: state.catalogue.project.title,
            provider: {
              id: provider.id,
              title: provider.title,
              model: { id: model.id, title: model.title, mode: model.modes[0] ?? 'agent' },
            },
            location: state.catalogue.currentLocation,
            documents: documentPaths(record),
          })
        : null;
    },
    /** Resolves allocated sessions first, then the seeded references. */
    overlayReferences(seeded: SessionReferenceOwner): SessionReferenceOwner {
      return {
        async resolve(sessionId) {
          const session = state.sessions.get(sessionId);

          return session
            ? {
                sessionId,
                specId: session.specId,
                projectId: state.catalogue.project.id,
                workspaceId: 'demo-workspace',
              }
            : seeded.resolve(sessionId);
        },
      };
    },
    /** Workspace sessions section: seeded sessions plus the ones allocated in this environment. */
    async contribution(specId: string, find: Find) {
      const record = await find(specId);
      if (!record) {
        return {
          section: { state: 'unavailable' as const, reason: 'source_unavailable' as const },
        };
      }

      const original = state.specifications.has(specId)
        ? { section: { state: 'available' as const, data: { items: [], attention: [] } } }
        : buildDemoSessionContribution(record);

      return {
        ...original,
        section: {
          state: 'available' as const,
          data: {
            ...original.section.data,
            items: [
              ...original.section.data.items,
              ...[...state.sessions.values()]
                .filter((session) => session.specId === specId)
                .map((session) => ({
                  id: session.sessionId,
                  title: session.title,
                  taskIds: [],
                  status: 'quiet' as const,
                })),
            ],
          },
        },
      };
    },
  };
}

export type DemoSessions = ReturnType<typeof createDemoSessions>;
