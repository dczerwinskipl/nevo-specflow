import {
  AuthorizationConfigurationError,
  type CapabilityId,
  type ResourceDefinition,
} from '@nevo/authorization';
import type { CapabilityProjection } from '@nevo/specflow-contracts/authorization';

export function projectCapabilities<R extends ResourceDefinition>(
  resource: R,
  effective: readonly CapabilityId[],
): CapabilityProjection<R> {
  const effectiveSet = new Set(effective);
  const projection: Record<string, boolean> = {};

  for (const [key, action] of Object.entries(resource.actions)) {
    const capability = resource.capabilities[key];
    if (capability === undefined) {
      throw new AuthorizationConfigurationError(
        `Resource '${resource.name}' has no capability mapped for action '${action}'.`,
      );
    }

    projection[action] = effectiveSet.has(capability);
  }

  return projection as CapabilityProjection<R>;
}
