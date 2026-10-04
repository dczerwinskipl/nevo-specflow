import type { RuntimeUserConfig } from '../authentication/config/model';
import type { RuntimeSetupUi } from '../../init/contracts';
import type { SpecFlowRole } from './roles';

export interface AuthorizationInitResult {
  readonly projectAuthorization: Record<string, unknown>;
  readonly summary: readonly string[];
}

export async function initAuthorization(
  ui: RuntimeSetupUi,
  users: Readonly<Record<string, RuntimeUserConfig>>,
): Promise<AuthorizationInitResult> {
  const userEntries = Object.entries(users);
  const assignments: {
    userId: string;
    role: SpecFlowRole;
    scope: Record<string, never>;
  }[] = [];

  for (const [index, [userId, user]] of userEntries.entries()) {
    const role = await ui.select<SpecFlowRole>(
      `Role for ${user.name} (${userId})`,
      [
        { value: 'admin', label: 'Admin', hint: 'Full project and settings access' },
        { value: 'developer', label: 'Developer', hint: 'Manage specs and sessions' },
        { value: 'viewer', label: 'Viewer', hint: 'Read specs and sessions' },
      ],
      index === 0 ? 'admin' : 'developer',
    );
    assignments.push({ userId, role, scope: {} });
  }

  if (
    assignments.length > 0 &&
    !assignments.some((assignment) => assignment.role === 'admin')
  ) {
    ui.note(
      'At least one administrator is required. Choose the canonical user that should bootstrap project administration.',
      'Authorization',
    );
    const firstUserId = assignments[0]?.userId;
    if (!firstUserId) throw new Error('Authorization setup expected at least one canonical user.');

    const adminUserId = await ui.select(
      'Project administrator',
      assignments.map((assignment) => ({
        value: assignment.userId,
        label: formatUser(users, assignment.userId),
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
    projectAuthorization: { assignments },
    summary: [
      'Authorization:',
      ...assignments.map(
        (assignment) => `  - ${formatUser(users, assignment.userId)}: ${assignment.role}`,
      ),
    ],
  };
}

function formatUser(
  users: Readonly<Record<string, RuntimeUserConfig>>,
  userId: string,
): string {
  const user = users[userId];
  return user ? `${user.name} (${userId})` : userId;
}
