import { useId, useState, type ReactNode } from 'react';
import { Button, Icon, InformationList, useContainerMinWidth, type IconName } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { translateMessage } from '../../../../i18n/message';
import { OperationalRow, type CompactFactItem } from '../../../../shared/operational-list';
import { WorkspaceSection } from '../../../../shared/workspace-section';
import type {
  SpecificationAttentionAction,
  SpecificationAttentionEntry,
} from '../../extensions/specificationAttentionItems';

/** Items shown before **Show N more** (UX contract: at most five). */
const SHOWN = 5;
/** Row width from which the action sits at the row's end instead of under the reason. */
const ACTION_BESIDE_MIN_WIDTH = 576;

export interface AttentionSectionProps {
  readonly items: readonly (SpecificationAttentionEntry & { readonly renderKey: string })[];
}

const toneClass = {
  attention: 'font-medium text-status-attention',
  danger: 'font-medium text-status-danger',
  neutral: 'text-content-secondary',
} as const;

/** The reason: its icon on the first text line, inside the running text. */
function Reason({
  text,
  tone,
  icon,
}: {
  text: string;
  tone: keyof typeof toneClass;
  icon?: IconName;
}) {
  return (
    <span className={toneClass[tone]}>
      {icon ? (
        <span className="mr-1.5 inline-flex h-[1lh] items-center align-top">
          <Icon name={icon} size="sm" aria-hidden="true" />
        </span>
      ) : null}
      {text}
    </span>
  );
}

/**
 * Requires attention: what needs a person now, from the owners' attention items, each with the one
 * action its owner maps (and an alternative where the item carries one). The actor shows only when
 * it is not the viewer. On a narrow row the actions follow the title and reason.
 */
export function AttentionSection({ items }: AttentionSectionProps) {
  const { t } = useTranslation();
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const { matches: beside, setElement } = useContainerMinWidth(ACTION_BESIDE_MIN_WIDTH);

  if (items.length === 0) {
    return null;
  }

  const text = (value: Parameters<typeof translateMessage>[1]) => translateMessage(t, value);
  const button = (action: SpecificationAttentionAction, variant: 'secondary' | 'ghost') => (
    <Button
      variant={variant}
      size="sm"
      disabled={action.disabled}
      title={action.disabledTitleKey ? t(action.disabledTitleKey) : undefined}
      onClick={action.onClick}
    >
      {text(action.label)}
    </Button>
  );
  const shown = expanded ? items : items.slice(0, SHOWN);

  return (
    <WorkspaceSection aria-labelledby={`${id}-heading`} data-requires-attention="">
      <WorkspaceSection.Header
        id={`${id}-heading`}
        headingTag="h2"
        title={t('specification.requiresAttentionHeading')}
        icon="triangle-alert"
        count={items.length}
      />
      <div ref={setElement}>
        <InformationList id={`${id}-list`}>
          {shown.map((entry) => {
            const { item } = entry;
            const facts: CompactFactItem[] = [
              ...(entry.facts ?? []).map(text),
              ...(item.actor === 'agent' ? [t('specification.attentionNeedsAgent')] : []),
            ];
            const actions: ReactNode =
              entry.action || entry.secondaryAction ? (
                <span className="pointer-events-auto flex flex-wrap gap-2">
                  {entry.action ? button(entry.action, 'secondary') : null}
                  {entry.secondaryAction ? button(entry.secondaryAction, 'ghost') : null}
                </span>
              ) : null;
            const reason = (
              <Reason
                text={entry.reason ? text(entry.reason) : item.reason}
                tone={entry.tone ?? 'neutral'}
                icon={entry.reasonIcon}
              />
            );

            return (
              <OperationalRow
                key={entry.renderKey}
                primary={entry.title ? text(entry.title) : item.title}
                factsLayout="inline"
                compactFacts={facts.slice(0, 3) as [CompactFactItem]}
                supporting={
                  beside ? (
                    reason
                  ) : (
                    <span className="grid justify-items-start gap-2">
                      {reason}
                      {actions}
                    </span>
                  )
                }
                leading={
                  entry.leading ?? (
                    <span className="flex items-center justify-center text-content-muted">
                      <Icon name={entry.icon} size="sm" aria-hidden="true" />
                    </span>
                  )
                }
                trailing={beside ? actions : undefined}
                dataAttributes={{ 'data-attention-item': item.id }}
              />
            );
          })}
        </InformationList>
      </div>
      {items.length > SHOWN ? (
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          aria-expanded={expanded}
          aria-controls={`${id}-list`}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded
            ? t('taskDetails.showLess')
            : t('specification.attentionShowMore', { count: items.length - SHOWN })}
        </Button>
      ) : null}
    </WorkspaceSection>
  );
}
