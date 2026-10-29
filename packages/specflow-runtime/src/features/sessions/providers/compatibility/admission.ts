import type { ProviderCompatibility } from './catalogue';

export interface ProviderAdmissionPrerequisites {
  configured: boolean;
  authenticated: boolean;
  securityVerified: boolean;
  protocolVerified: boolean;
  executionMode: string;
  managedEffectsAvailable?: boolean;
}

/** Protocol compatibility alone never authorizes host execution. */
export function admitProvider(
  compatibility: ProviderCompatibility,
  prerequisites: ProviderAdmissionPrerequisites,
): { allowed: boolean; reason?: string } {
  if (compatibility.classification === 'unsupported') {
    return { allowed: false, reason: compatibility.reason };
  }

  if (
    !prerequisites.configured ||
    !prerequisites.authenticated ||
    !prerequisites.securityVerified ||
    !prerequisites.protocolVerified ||
    !(
      prerequisites.executionMode === 'read-only' ||
      (prerequisites.executionMode === 'workspace-write' &&
        prerequisites.managedEffectsAvailable === true)
    )
  ) {
    return { allowed: false, reason: 'Provider admission prerequisites are not satisfied.' };
  }

  return { allowed: true };
}
