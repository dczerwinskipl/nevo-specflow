import type { ProviderCompatibility } from './catalogue';

export interface ProviderAdmissionPrerequisites {
  configured: boolean;
  authenticated: boolean;
  securityVerified: boolean;
  executionMode: string;
}

/** Protocol compatibility alone never authorizes host execution. */
export function admitProvider(
  compatibility: ProviderCompatibility,
  prerequisites: ProviderAdmissionPrerequisites,
): { allowed: boolean; reason?: string } {
  if (compatibility.classification !== 'verified')
    return { allowed: false, reason: compatibility.reason };
  if (
    !prerequisites.configured ||
    !prerequisites.authenticated ||
    !prerequisites.securityVerified ||
    prerequisites.executionMode !== 'read-only' ||
    !compatibility.record.executionModes.includes('read-only')
  )
    return { allowed: false, reason: 'Provider admission prerequisites are not satisfied.' };
  return { allowed: true };
}
