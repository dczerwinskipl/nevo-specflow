import type { Message } from '../../../../i18n/message';
import type { ProviderDiagnosis } from './providerDiagnosis';

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
  /**
   * The short status under the provider's name, from a small fixed vocabulary per reason (so it
   * stays one line); absent when the catalogue states no reason code (the demo catalogue).
   */
  status?: Message;
  /**
   * Not available because the availability check gave no result (it failed or did not finish):
   * this says nothing about the provider itself, and checking again is what to do.
   */
  undetermined?: true;
  /** Why an unavailable provider cannot start and how to fix it, shown on request. */
  diagnosis?: ProviderDiagnosis;
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

/**
 * Whether the chosen agent can start a new Session now: the one rule Run with agent and both Create
 * forms judge an agent choice by.
 */
export function agentCanStart(catalogue: StartCatalogue, providerId: string): boolean {
  return catalogue.providers.some((provider) => provider.id === providerId && provider.available);
}

/** The agents that can start a new Session now, in the catalogue's order. */
export function startableAgents(catalogue: StartCatalogue): readonly StartProvider[] {
  return catalogue.providers.filter((provider) => provider.available);
}
