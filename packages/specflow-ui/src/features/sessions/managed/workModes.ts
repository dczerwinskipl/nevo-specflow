import type { ProviderDescriptor, StartTurn } from '@nevo/specflow-contracts/sessions';

/**
 * One row of the Composer's work-mode picker, exactly as a provider catalogue describes it (owner
 * decision: the Runtime is the source of truth for which work modes exist, per provider, under the
 * provider's own names). `id` is opaque; `title` is the catalogue's own title, never UI copy.
 */
export interface WorkModeOption {
  id: string;
  title: string;
  /** Listed but not selectable; `reason` is the catalogue's own explanation when it gives one. */
  disabled?: boolean;
  reason?: string;
}

/** The command fields a work-mode pick sets on the next Turn (`StartTurn.mode`/`providerModeId`). */
export type WorkModeCommand = Required<Pick<StartTurn, 'mode' | 'providerModeId'>>;

/**
 * A Session provider's `providerModes`, in catalogue order. A mode is selectable only when the
 * provider reports it ready, does not deny authorization, and its engine safety mode is one the
 * provider currently offers (the same rule the start catalogue applies, `start/catalogue/fromProviderDescriptors`).
 */
export function runtimeWorkModes(provider: ProviderDescriptor | undefined): WorkModeOption[] {
  return (provider?.providerModes ?? []).map((mode) => {
    const disabled =
      mode.readiness !== 'ready' ||
      mode.authorized === false ||
      !provider!.modes.includes(mode.mode);

    return {
      id: mode.modeId,
      title: mode.title,
      ...(disabled ? { disabled } : {}),
      ...(disabled && mode.reason ? { reason: mode.reason } : {}),
    };
  });
}

/**
 * The selected work mode: the first `chosen` id the catalogue lists (an explicit pick, then the
 * Session's current mode — kept even when the catalogue now marks it unavailable, so the trigger
 * never claims a mode the next Turn would not inherit), else the catalogue's `defaultId` when it
 * is selectable, else the first selectable mode.
 */
export function selectedWorkModeId(
  options: readonly WorkModeOption[],
  chosen: readonly (string | undefined)[],
  defaultId: string | undefined,
): string | undefined {
  const listed = chosen.find((id) => id && options.some((option) => option.id === id));
  const selectable = options.filter((option) => !option.disabled);

  return listed ?? selectable.find((option) => option.id === defaultId)?.id ?? selectable[0]?.id;
}

/** The `StartTurn` fields for picking `modeId`: its engine safety mode plus the provider mode id. */
export function runtimeWorkModeCommand(
  provider: ProviderDescriptor | undefined,
  modeId: string,
): WorkModeCommand | undefined {
  const mode = provider?.providerModes?.find((item) => item.modeId === modeId);

  return mode ? { mode: mode.mode, providerModeId: mode.modeId } : undefined;
}
