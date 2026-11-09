import type { DemoCatalogue, DemoSpecification } from '../../demo-catalogue';
import { SessionError } from '../errors';
import type { SessionAssociations, SessionReference } from '../reference-owner';

const DEMO_PROJECT = 'demo-project';
const DEMO_WORKSPACE = 'demo-workspace';

/** The seeded catalogue Session's home Specification and the Tasks its executions name. */
function find(records: readonly DemoSpecification[], sessionId: string) {
  for (const record of records) {
    const executions = record.currentExecutions?.filter((item) => item.sessionId === sessionId);
    if (
      executions?.length ||
      record.signals?.some(
        (item) => item.target.kind === 'session' && item.target.sessionId === sessionId,
      )
    ) {
      return {
        specId: record.id,
        taskIds: [...new Set(executions?.flatMap((item) => [...item.taskIds]) ?? [])],
      };
    }
  }

  return null;
}

const reference = (sessionId: string, specId: string): SessionReference => ({
  sessionId,
  specId,
  projectId: DEMO_PROJECT,
  workspaceId: DEMO_WORKSPACE,
});

/**
 * Demo mode: the seeded catalogue is the association registry. Every seeded Session is
 * associated with the Specification whose executions or signals name it; there are no standalone
 * demo Sessions.
 */
export function createDemoSessionReferences(catalogue: DemoCatalogue): SessionAssociations {
  async function known(sessionId: string) {
    const found = find(await catalogue.all(), sessionId);
    if (!found) {
      throw new SessionError('SESSION_NOT_FOUND', 'Session not found.');
    }

    return found;
  }

  return {
    async resolve(sessionId) {
      const found = find(await catalogue.all(), sessionId);

      return found ? reference(sessionId, found.specId) : null;
    },
    async resolveMany(sessionIds) {
      const records = await catalogue.all();
      const resolved = new Map<string, SessionReference>();
      for (const sessionId of sessionIds) {
        const found = find(records, sessionId);
        if (found) {
          resolved.set(sessionId, reference(sessionId, found.specId));
        }
      }

      return resolved;
    },
    async identity(sessionId) {
      const found = await known(sessionId);

      return { projectId: DEMO_PROJECT, sessionId, specId: found.specId };
    },
    association: known,
  };
}
