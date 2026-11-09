import type { FastifyInstance, RawServerBase } from 'fastify';
import { Type, type Static, type TSchema, type TUnsafe } from 'typebox';

import { AuthSessionResponseSchema } from '@nevo/specflow-contracts/authentication';

/**
 * The API contracts of `@nevo/specflow-contracts` that more than one operation answers. Each carries
 * a stable `$id` in the contracts package; here it is only registered as a Fastify shared schema,
 * so routes reference one definition and the OpenAPI document emits it once under
 * `components.schemas` with that `$id` as its name.
 */
const SHARED_CONTRACTS: readonly TSchema[] = [AuthSessionResponseSchema];

const sharedContracts = new Set<TSchema>(SHARED_CONTRACTS);

/**
 * Registers the shared contracts on the root instance. It MUST run before any route registration:
 * a route referencing a contract compiles only where the contract is visible, and registering on
 * the root makes it visible in every encapsulated plugin.
 */
export function registerSharedContracts<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
): void {
  for (const contract of SHARED_CONTRACTS) {
    app.addSchema(contract);
  }
}

/**
 * A route schema referencing a shared contract by its `$id`. Validation and serialization resolve
 * the reference to the registered definition, and route types keep the contract's static type.
 */
export function contractRef<Contract extends TSchema>(
  contract: Contract,
): TUnsafe<Static<Contract>> {
  const { $id } = contract as { readonly $id?: unknown };
  if (!sharedContracts.has(contract) || typeof $id !== 'string') {
    throw new Error('Only a registered shared contract with an `$id` can be referenced.');
  }

  return Type.Unsafe<Static<Contract>>({ $ref: $id });
}
