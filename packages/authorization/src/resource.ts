import { AuthorizationConfigurationError } from './errors';
import type { CapabilityId, ResourceDefinition } from './types';
import { assertIdentifierSegment } from './validation';

type CapabilityMap = Readonly<Record<string, string>>;

type QualifiedCapabilities<Name extends string, Actions extends CapabilityMap> = Readonly<{
  [Key in keyof Actions]: `${Name}.${Extract<Actions[Key], string>}`;
}>;

export interface DefinedResource<
  Name extends string,
  Actions extends CapabilityMap,
> extends ResourceDefinition {
  readonly name: Name;
  readonly actions: Actions;
  readonly capabilities: QualifiedCapabilities<Name, Actions>;
}

export interface DefineResourceInput<Name extends string, Actions extends CapabilityMap> {
  readonly name: Name;
  readonly actions: Actions;
}

export function defineResource<const Name extends string, const Actions extends CapabilityMap>(
  input: DefineResourceInput<Name, Actions>,
): DefinedResource<Name, Actions> {
  assertIdentifierSegment(input.name, 'Resource name');

  const actions = Object.assign({}, input.actions);
  const capabilities: Record<string, CapabilityId> = {};
  const seen = new Set<CapabilityId>();

  for (const [key, action] of Object.entries(input.actions)) {
    assertIdentifierSegment(action, `Capability action '${key}'`);

    const capability = `${input.name}.${action}`;
    if (seen.has(capability)) {
      throw new AuthorizationConfigurationError(
        `Resource '${input.name}' defines duplicate capability '${capability}'.`,
      );
    }

    seen.add(capability);
    capabilities[key] = capability;
  }

  return {
    name: input.name,
    actions,
    capabilities: capabilities as QualifiedCapabilities<Name, Actions>,
  };
}
