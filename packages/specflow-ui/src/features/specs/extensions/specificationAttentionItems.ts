import type { ReactNode } from 'react';
import type { IconName } from '@nevo/ui';
import { defineUiExtensionPoint, type UiContribution } from '../../../app/ui-modules/contracts';
import type { Message } from '../../../i18n/message';
import type { AttentionItem } from '../read-model/model';
import type { SpecificationWorkSectionContext } from './specificationWorkSections';

/** One operation of an Attention entry: the owning module's own flow for the item's action. */
export interface SpecificationAttentionAction {
  /** The label: the owner's message, or display text when it has none. */
  readonly label: Message | string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly disabledTitleKey?: 'common.notImplemented';
}

/** A module contributes presentation/actions for attention sourced from the Runtime snapshot. */
export interface SpecificationAttentionEntry {
  readonly item: AttentionItem;
  readonly icon: IconName;
  /** A leading mark of its own (a Session's provider); otherwise `icon`. */
  readonly leading?: ReactNode;
  /** What the item is about, after its title (`T-02 · Backend`, `Session · Claude`). */
  readonly facts?: readonly (Message | string)[];
  /** Copy the owning module has for the item's code; otherwise the item's own title and reason. */
  readonly title?: Message;
  readonly reason?: Message;
  /** How the reason reads (never colour alone: it carries `reasonIcon` or words). */
  readonly tone?: 'attention' | 'danger' | 'neutral';
  readonly reasonIcon?: IconName;
  readonly action?: SpecificationAttentionAction;
  /** An alternative to `action` (for example Cancel task). */
  readonly secondaryAction?: SpecificationAttentionAction;
}

/** A data source can be healthy with no items, unavailable or intentionally excluded. */
export type SpecificationAttentionResult =
  | readonly SpecificationAttentionEntry[]
  | { readonly state: 'unavailable' }
  | { readonly state: 'excluded' };

export interface SpecificationAttentionContribution extends UiContribution {
  readonly getItems: (context: SpecificationWorkSectionContext) => SpecificationAttentionResult;
}

export const specificationAttentionItems =
  defineUiExtensionPoint<SpecificationAttentionContribution>('specification.attention.items');
