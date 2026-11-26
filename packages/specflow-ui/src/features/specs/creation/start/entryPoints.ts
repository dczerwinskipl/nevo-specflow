import type { IconGlyph } from '@nevo/ui';
import { message, type Message } from '../../../../i18n/message';
import { productIcons } from '../../../../shared/product-icons';

/**
 * The ways to start a new Specification, as data: the start screen renders whatever list it is
 * given, one whole-tile action per entry, in this order. A new way to start ("From an idea") is one
 * more id and entry here plus its own form; the start screen and the existing forms do not change.
 */
export type CreateEntryPointId = 'manual' | 'agent';

export interface CreateEntryPoint {
  readonly id: CreateEntryPointId;
  readonly title: Message;
  readonly text: Message;
  /** A product concept icon (`productIcons`) or a Nevo UI registry icon for a plain action. */
  readonly icon: IconGlyph;
}

export const manualEntryPoint: CreateEntryPoint = {
  id: 'manual',
  title: message('create.start.manual.title'),
  text: message('create.start.manual.text'),
  icon: 'edit',
};

/** A project Runtime: the agent starts the first workflow step right after Create. */
export const agentEntryPoint: CreateEntryPoint = {
  id: 'agent',
  title: message('create.start.agent.title'),
  text: message('create.start.agent.text'),
  icon: productIcons.agent,
};

/** The ways to start a project Runtime offers (owner, 2026-11-26: Manually first). */
export const projectEntryPoints: readonly CreateEntryPoint[] = [manualEntryPoint, agentEntryPoint];

/**
 * The demo Runtime: its Create with an agent opens an idle Session (no workflow step starts), so the
 * agent entry says that.
 */
export const demoEntryPoints: readonly CreateEntryPoint[] = [
  manualEntryPoint,
  { ...agentEntryPoint, text: message('create.method.aiText') },
];
