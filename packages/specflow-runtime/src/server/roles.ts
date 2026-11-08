import type { CapabilityId } from '@nevo/authorization';

import type { SpecFlowRoleId } from '../features/auth';
import { SessionCapabilities } from '../features/sessions';
import { SettingsCapabilities } from '../features/settings';
import { SpecCapabilities, ProjectGitCapabilities } from '../features/specs';

/**
 * The built-in product role policy. Capabilities stay granular: none implies another, so a role is
 * only the set it lists. `spec.start-session` associates a new Session with a Specification and
 * implies no Session capability.
 */
export function specFlowRoleCapabilities(): Readonly<
  Record<SpecFlowRoleId, readonly CapabilityId[]>
> {
  const viewer = [
    SpecCapabilities.capabilities.View,
    SessionCapabilities.capabilities.View,
  ] as const;

  const developer = [
    ...viewer,
    SpecCapabilities.capabilities.Create,
    SpecCapabilities.capabilities.Manage,
    SpecCapabilities.capabilities.CloseWorktree,
    SpecCapabilities.capabilities.CloseSpecification,
    SpecCapabilities.capabilities.StartSession,
    SessionCapabilities.capabilities.Create,
    SessionCapabilities.capabilities.Manage,
    SessionCapabilities.capabilities.Delete,
    SessionCapabilities.capabilities.ExecuteWrite,
  ] as const;

  return {
    viewer,
    developer,
    admin: [
      ...developer,
      SessionCapabilities.capabilities.ViewProviderLimits,
      SettingsCapabilities.capabilities.View,
      SettingsCapabilities.capabilities.Manage,
      ProjectGitCapabilities.capabilities.Integrate,
      ProjectGitCapabilities.capabilities.CloseWorkspace,
    ],
  };
}
