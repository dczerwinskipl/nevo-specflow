import type { RuntimeUserConfig } from '../authentication/config/model';
import type { RuntimeSetupUi } from '../../init/contracts';
import type { SpecFlowRole } from './roles';

export interface AuthorizationInitResult {
  readonly projectAuthorization: Record<string, unknown>;
  readonly summary: string;
}

export async function initAuthorization(
  ui: RuntimeSetupUi,
  users: Readonly<Record<string, RuntimeUserConfig>>,
): Promise<AuthorizationInitResult> {
  const assignments: Array<{ userId: string; role: SpecFlowRole; scope: Record<string, never> }> =
    [];

  for (const [userId, user] of Object.entries(users)) {
    const role = await ui.select<SpecFlowRole>(
      `Role for ${user.name} (${userId})`,
      [
        { value: 'admin', label: 'Admin', hint: 'Full project and settings access' },
        { value: 'developer', label: 'Developer', hint: 'Manage specs and sessions' },
        { value: 'viewer', label: 'Viewer', hint: 'Read specs and sessions' },
      ],
      'admin',
    );
    assignments.push({ userId, role, scope: {} });
  }

  return {
    projectAuthorization: { assignments },
    summary: `Authorization: ${String(assignments.length)} user${assignments.length === 1 ? '' : 's'} assigned`,
  };
}
