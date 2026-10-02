import { AuthorizationConfigurationError } from './errors.js';
import type { CapabilityId, ResourceDefinition } from './types.js';
import { assertIdentifierSegment } from './validation.js';

type CapabilityMap = Readonly<Record<string, string>>;

type QualifiedCapabilities<
  Name extends string,
  Capabilities extends CapabilityMap,
> = Readonly<{
  [Key in keyof Capabilities]: `${Name}.${Extract<Capabilities[Key], string>}`;
}>;

export interface DefinedResource<
  Name extends string,
  Capabilities extends CapabilityMap,
> extends ResourceDefinition {
  readonly name: Name;
  readonly capabilities: QualifiedCapabilities<Name, Capabilities>;
}

export interface DefineResourceInput<
  Name extends string,
  Capabilities extends CapabilityMap,
> {
  readonly name: Name;
  readonly capabilities: Capabilities;
}

export function defineResource<
  const Name extends string,
  const Capabilities extends CapabilityMap,
>(
  input: DefineResourceInput<Name, Capabilities>,
): DefinedResource<Name, Capabilities> {
  assertIdentifierSegment(input.name, 'Resource name');

  const capabilities: Record<string, CapabilityId> = {};
  const capabilityIds: CapabilityId[] = [];
  const seen = new Set<CapabilityId>();

  for (const [key, action] of Object.entries(input.capabilities)) {
    assertIdentifierSegment(action, `Capability action '${key}'`);

    const capability = `${input.name}.${action}`;
    if (seen.has(capability)) {
      throw new AuthorizationConfigurationError(
        `Resource '${input.name}' defines duplicate capability '${capability}'.`,
      );
    }

    seen.add(capability);
    capabilities[key] = capability;
    capabilityIds.push(capability);
  }

  return {
    name: input.name,
    capabilities: capabilities as QualifiedCapabilities<Name, Capabilities>,
    capabilityIds,
  };
}
