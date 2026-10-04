import type { RuntimeUserConfig } from '../authentication/config/model';
import type { RuntimeSetupUi } from '../../init/contracts';
import type { SpecFlowRole } from './roles';

export interface AuthorizationInitResult {
  readonly projectAuthorization: Record<string, unknown>;
  readonly summary: readonly string[];
}

export async function initAuthorization(
  ui: RuntimeSetupUi,
  canonicalUsers: ReadonlyMap<string, RuntimeUserConfig>,
): Promise<AuthorizationInitResult> {
  const assignments: { userId: string; role: SpecFlowRole; scope: Record<string, never> }[] = [];

  let index = 0;
  for (const [userId, user] of canonicalUsers) {
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
    index += 1;
  }

  if (assignments.length > 0 && !assignments.some((assignment) => assignment.role === 'admin')) {
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
        label: formatUser(canonicalUsers, assignment.userId),
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
        (assignment) =>
          `  - ${formatUser(canonicalUsers, assignment.userId)}: ${assignment.role}`,
      ),
    ],
  };
}

function formatUser(
  canonicalUsers: ReadonlyMap<string, RuntimeUserConfig>,
  userId: string,
): string {
  const user = canonicalUsers.get(userId);
  return user ? `${user.name} (${userId})` : userId;
}
