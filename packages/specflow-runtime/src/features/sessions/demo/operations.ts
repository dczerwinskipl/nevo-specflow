import type {
  DemoSessionDetail,
  DemoSessionInput,
  DemoSessionResult,
} from '@nevo/specflow-contracts/demo';
import type { DemoCatalogue, DemoSpecification } from '../../demo-catalogue';
import { createDemoSessionList } from './list';
import { DemoOperationError, type DemoState } from '../../../demo/state';
import type { SessionAssociations } from '../reference-owner';
import { buildDemoSessionContribution, rankDemoSessions, seededDemoAgent } from './contribution';
import { DEMO_SEEDED_AT } from './seeded-at';
import { buildCatalogueSessionDetail } from './seeded-detail';

type Find = (specId: string) => Promise<DemoSpecification | undefined>;

/**
 * Sessions-owned demo operations over the shared demo state: session allocation for a created or
 * seeded specification, seeded session details, the session reference overlay and the workspace
 * sessions section. Document paths for the context snapshot are supplied by the caller.
 */
export function createDemoSessions(state: DemoState) {
  const allocatedAt = new Map<string, string>();

  return {
    /** The demo Session list over the catalogue and the Sessions allocated here. */
    list(catalogue: DemoCatalogue) {
      return createDemoSessionList({ state, catalogue, allocatedAt });
    },
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
      const sessionId = state.uuid();
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
      allocatedAt.set(sessionId, new Date().toISOString());
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
    overlayReferences(seeded: SessionAssociations): SessionAssociations {
      const allocated = (sessionId: string) => {
        const session = state.sessions.get(sessionId);

        return session
          ? {
              sessionId,
              specId: session.specId,
              projectId: state.catalogue.project.id,
              workspaceId: 'demo-workspace',
            }
          : undefined;
      };

      return {
        async resolve(sessionId) {
          return allocated(sessionId) ?? seeded.resolve(sessionId);
        },
        async resolveMany(sessionIds) {
          const resolved = new Map(
            await seeded.resolveMany(sessionIds.filter((id) => !state.sessions.has(id))),
          );
          for (const sessionId of sessionIds) {
            const reference = allocated(sessionId);
            if (reference) {
              resolved.set(sessionId, reference);
            }
          }

          return resolved;
        },
        async identity(sessionId) {
          const session = state.sessions.get(sessionId);

          return session
            ? { projectId: state.catalogue.project.id, sessionId, specId: session.specId }
            : seeded.identity(sessionId);
        },
        async association(sessionId) {
          const session = state.sessions.get(sessionId);

          // An allocated demo Session belongs to its Specification and names no Task.
          return session ? { specId: session.specId, taskIds: [] } : seeded.association(sessionId);
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
        : buildDemoSessionContribution(record, seededDemoAgent(state.catalogue));

      // Sessions allocated in this environment are the newest, newest first.
      const items = [
        ...[...state.sessions.values()]
          .filter((session) => session.specId === specId)
          .reverse()
          .map((session) => ({
            id: session.sessionId,
            title: session.title,
            taskIds: [],
            status: 'quiet' as const,
            providerId: session.configuration.providerId,
            providerTitle: session.configuration.providerTitle,
            modelId: session.configuration.modelId,
            modelTitle: session.configuration.modelTitle,
            updatedAt: allocatedAt.get(session.sessionId) ?? DEMO_SEEDED_AT,
          })),
        ...original.section.data.items,
      ];

      return {
        section: {
          state: 'available' as const,
          data: { ...original.section.data, items },
        },
        recommendedSessionIds: rankDemoSessions(items),
      };
    },
  };
}

export type DemoSessions = ReturnType<typeof createDemoSessions>;
