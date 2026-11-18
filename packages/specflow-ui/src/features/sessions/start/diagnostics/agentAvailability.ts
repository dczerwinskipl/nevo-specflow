import type { StartCatalogue, StartProvider } from '../catalogue/startCatalogue';

/**
 * What the start screen says about the agents that cannot start, under the picker:
 * - `some`: one line naming them, the details on request;
 * - `none`: no agent is available and every one is confirmed unavailable;
 * - `undetermined`: no agent is available and at least one check gave no result, so availability
 *   is not known ("check again" leads, not "how to fix");
 * - `empty`: the catalogue lists no agent at all, so there is nothing to diagnose per agent.
 */
export type AgentAvailabilitySummary =
  | { readonly kind: 'all' }
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'some' | 'none' | 'undetermined';
      readonly unavailable: readonly StartProvider[];
      /** Every unavailable agent is only undetermined: checking again is the first action. */
      readonly onlyUndetermined: boolean;
    };

export function agentAvailability(catalogue: StartCatalogue): AgentAvailabilitySummary {
  if (catalogue.providers.length === 0) {
    return { kind: 'empty' };
  }

  const unavailable = catalogue.providers.filter((provider) => !provider.available);
  if (unavailable.length === 0) {
    return { kind: 'all' };
  }

  const onlyUndetermined = unavailable.every((provider) => provider.undetermined);
  if (unavailable.length < catalogue.providers.length) {
    return { kind: 'some', unavailable, onlyUndetermined };
  }

  return {
    kind: unavailable.some((provider) => provider.undetermined) ? 'undetermined' : 'none',
    unavailable,
    onlyUndetermined,
  };
}

/**
 * Whether **Check again** can change what the diagnosis says: at least one fix is seen by the next
 * catalogue read. A fix that needs a restart (a configuration change) is not, and the UI cannot
 * restart the Runtime, so then the restart is the next step instead of a button.
 */
export function recheckCanHelp(provider: StartProvider): boolean {
  const fixes = provider.diagnosis?.fixes;

  return fixes === undefined || fixes.some((fix) => fix.applies === 'recheck');
}

/** Whether every fix of the provider needs a restart of Nevo SpecFlow. */
export function onlyRestartHelps(provider: StartProvider): boolean {
  const fixes = provider.diagnosis?.fixes ?? [];

  return fixes.length > 0 && fixes.every((fix) => fix.applies === 'restart');
}
