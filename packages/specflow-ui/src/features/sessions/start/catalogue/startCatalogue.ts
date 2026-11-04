import type { Message } from '../../../../i18n/message';

/**
 * What a new Session can be started with, independent of where the catalogue comes from (the demo
 * creation catalogue or the managed Runtime's provider catalogue). The start form, its field
 * helpers and the readiness policy read only this model; two adapters build it
 * (`fromDemoCatalogue`, `fromProviderDescriptors`).
 */
export interface StartMode {
  /** Opaque id; the source maps it back to what its own start command needs. */
  id: string;
  /** The catalogue's own title, or a message for the engine's plain safety modes. */
  title: Message | string;
  /** Listed but not selectable while false; `reason` then says why. */
  available: boolean;
  reason?: string;
}

export interface StartModel {
  id: string;
  title: string;
  efforts: readonly string[];
  /** The ids of the provider's modes this model can run. */
  modeIds: readonly string[];
}

export interface StartProvider {
  id: string;
  title: string;
  /** Identity of the provider's mark for `SessionProviderIcon`; unknown marks fall back to a glyph. */
  icon: string | undefined;
  available: boolean;
  /**
   * The catalogue's reason: why the provider is unavailable, or a caveat of an available one.
   * Catalogue-authored text is shown as it is.
   */
  reason?: Message | string;
  /** What the user can do about an unavailable provider (for example sign in again). */
  hint?: Message | string;
  /** How the provider is accessed; absent when the catalogue does not state it. */
  access?: 'api' | 'subscription';
  /**
   * The models the user may choose from. Empty when the provider offers no model choice: the
   * Session then starts at the provider's default model.
   */
  models: readonly StartModel[];
  /** The provider's work modes in the order it offers them. */
  modes: readonly StartMode[];
  /** The mode a new Session starts in when it is available (and the model runs it). */
  defaultModeId?: string;
}

export interface StartCatalogue {
  /** A demo catalogue: its providers are described as demo data. */
  demo: boolean;
  providers: readonly StartProvider[];
}
