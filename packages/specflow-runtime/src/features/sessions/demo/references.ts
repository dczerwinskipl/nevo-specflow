import type { DemoCatalogue } from '../../demo-catalogue';
import type { SessionReference, SessionReferenceOwner } from '../reference-owner';
export function createDemoSessionReferences(catalogue: DemoCatalogue): SessionReferenceOwner {
  function find(records: Awaited<ReturnType<DemoCatalogue['all']>>, sessionId: string) {
    for (const record of records) {
      if (
        record.currentExecutions?.some((item) => item.sessionId === sessionId) ||
        record.signals?.some(
          (item) => item.target.kind === 'session' && item.target.sessionId === sessionId,
        )
      ) {
        return {
          sessionId,
          specId: record.id,
          projectId: 'demo-project',
          workspaceId: 'demo-workspace',
        };
      }
    }

    return null;
  }

  return {
    async resolve(sessionId) {
      return find(await catalogue.all(), sessionId);
    },
    async resolveMany(sessionIds) {
      const records = await catalogue.all();
      const resolved = new Map<string, SessionReference>();
      for (const sessionId of sessionIds) {
        const reference = find(records, sessionId);
        if (reference) {
          resolved.set(sessionId, reference);
        }
      }

      return resolved;
    },
  };
}
