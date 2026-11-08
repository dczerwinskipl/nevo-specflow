import type { ProviderCompatibility } from './catalogue';

export interface ProviderAdmissionPrerequisites {
  configured: boolean;
  authenticated: boolean;
  /** The adapter checked its supported native policy/configuration contract.
   * This is not per-build certification or proof of an OS sandbox. */
  executionPolicyChecked: boolean;
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
    !prerequisites.executionPolicyChecked ||
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
