import type { ProviderDescriptor } from './commands';

/** The work modes an agent's fresh Session prefers, in order: no prompt per edit when possible. */
const PREFERRED_WORK_MODES = ['auto', 'acceptEdits'] as const;

/**
 * The provider mode a fresh agent Session runs `model` in: `auto` when the provider lists it as
 * ready, authorized and running this model, else `acceptEdits` when listed; `undefined` when the
 * provider names neither (its own default applies). The one rule: the Runtime starts the Session
 * in it, and the Create form names it before the Session exists.
 */
export function workModeFor(
  provider: Pick<ProviderDescriptor, 'providerModes'> | undefined,
  model: string,
): { readonly providerModeId: string; readonly title: string } | undefined {
  for (const id of PREFERRED_WORK_MODES) {
    const mode = provider?.providerModes?.find(
      (candidate) =>
        candidate.modeId === id &&
        candidate.mode === 'workspace-write' &&
        candidate.readiness === 'ready' &&
        candidate.authorized !== false &&
        (candidate.modelIds === undefined || candidate.modelIds.includes(model)),
    );
    if (mode) {
      return { providerModeId: mode.modeId, title: mode.title };
    }
  }

  return undefined;
}
