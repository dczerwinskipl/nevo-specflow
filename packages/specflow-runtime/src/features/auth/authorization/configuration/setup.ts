import type { RuntimeUserConfig } from '../../authentication/configuration/model';
import type { RuntimeSetupUi } from '../../../../init/contracts';
import type { SpecFlowRoleId } from '../roles';

interface SetupAssignment {
  readonly userId: string;
  readonly user: RuntimeUserConfig;
  role: SpecFlowRoleId;
}

export interface AuthorizationSetupResult {
  readonly projectAuthorization: Record<string, unknown>;
  readonly summary: readonly string[];
}

export interface AuthorizationSetup {
  addUser(userId: string, user: RuntimeUserConfig): Promise<void>;
  finish(): Promise<AuthorizationSetupResult>;
}

export function createAuthorizationSetup(ui: RuntimeSetupUi): AuthorizationSetup {
  const assignments: SetupAssignment[] = [];

  return {
    async addUser(userId, user) {
      if (assignments.some((assignment) => assignment.userId === userId)) {
        throw new Error(`Authorization setup already contains user '${userId}'.`);
      }

      const role = await ui.select<SpecFlowRoleId>(
        `Role for ${user.name}`,
        [
          { value: 'admin', label: 'Admin', hint: 'Full access including settings' },
          { value: 'developer', label: 'Developer', hint: 'Manage specs and sessions' },
          { value: 'viewer', label: 'Viewer', hint: 'Read specs and sessions' },
        ],
        assignments.length === 0 ? 'admin' : 'developer',
      );

      assignments.push({ userId, user, role });
    },

    async finish() {
      if (
        assignments.length > 0 &&
        !assignments.some((assignment) => assignment.role === 'admin')
      ) {
        ui.note(
          'At least one administrator is required. ' +
            'Choose the user that should bootstrap administration.',
          'Authorization',
        );
        const firstUserId = assignments[0]?.userId;
        if (!firstUserId) throw new Error('Authorization setup expected at least one user.');

        const adminUserId = await ui.select(
          'Administrator',
          assignments.map((assignment) => ({
            value: assignment.userId,
            label: formatUser(assignment),
          })),
          firstUserId,
        );
        const assignment = assignments.find((candidate) => candidate.userId === adminUserId);
        if (!assignment) {
          throw new Error(`Unknown authorization setup user '${adminUserId}'.`);
        }
        assignment.role = 'admin';
      }

      return {
        projectAuthorization: {
          assignments: assignments.map((assignment) => ({
            userId: assignment.userId,
            role: assignment.role,
          })),
        },
        summary: [
          'Authorization:',
          ...assignments.map((assignment) => `  - ${formatUser(assignment)}: ${assignment.role}`),
        ],
      };
    },
  };
}

function formatUser(assignment: SetupAssignment): string {
  return assignment.user.name === assignment.userId
    ? assignment.userId
    : `${assignment.user.name} (${assignment.userId})`;
}
