import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  choiceSurfaceCheckClassName,
  choiceSurfaceClassName,
  cn,
  Icon,
  Typography,
} from '@nevo/ui';
import { useMessage } from '../../../../i18n/message';
import { ChoiceTileGroup } from '../../../../shared/controls/ChoiceTile';
import { SessionProviderIcon } from '../../shared/SessionProviderIcon';
import type { StartCatalogue, StartProvider } from '../catalogue/startCatalogue';
import { AgentStatusGlyph, agentStatusText } from '../diagnostics/agentStatus';

/**
 * Which agent runs the new Session: a radio group of compact cards. The provider is fixed for the
 * life of a Session, so the Composer never offers this choice. Unavailable agents stay listed with
 * their short status but cannot be chosen; why, and how to fix it, is said once under the cards.
 */
export function AgentPicker({
  catalogue,
  providerId,
  labelledBy,
  describedBy,
  onSelect,
}: {
  catalogue: StartCatalogue;
  providerId: string;
  /** The legend that names the group. */
  labelledBy: string;
  /** The line under the cards about the agents that cannot start. */
  describedBy?: string;
  onSelect: (providerId: string) => void;
}) {
  const { t } = useTranslation();
  const { providers } = catalogue;
  if (providers.length === 0) {
    return (
      <Typography as="p" variant="body-sm" className="text-content-secondary">
        {t('create.agent.noProviders')}
      </Typography>
    );
  }

  const columns = cn(
    providers.length === 3 ? '@2xl:grid-cols-3' : providers.length > 1 && '@lg:grid-cols-2',
    providers.length >= 5 && '@2xl:grid-cols-3',
  );

  return (
    <ChoiceTileGroup aria-labelledby={labelledBy} columns={columns} describedBy={describedBy}>
      {providers.map((provider) => (
        <AgentCard
          key={provider.id}
          provider={provider}
          demo={catalogue.demo}
          checked={providerId === provider.id}
          onSelect={() => onSelect(provider.id)}
        />
      ))}
    </ChoiceTileGroup>
  );
}

/**
 * A 28 px logo, the name over the short status, and a fixed slot for the check mark (reserved
 * while unselected, so selecting moves nothing): one 72 px geometry in every state and at every
 * width. A product composition on the design system's choice-surface recipe, whose own tracks are
 * sized for an 18 px icon at the top. An unavailable agent's logo is greyed out.
 */
function AgentCard({
  provider,
  demo,
  checked,
  onSelect,
}: {
  provider: StartProvider;
  demo: boolean;
  checked: boolean;
  onSelect: () => void;
}) {
  const id = useId();
  const text = useMessage();
  const unavailable = !provider.available;

  return (
    <label
      className={cn(
        choiceSurfaceClassName,
        'grid grid-cols-[1.75rem_minmax(0,1fr)_var(--spacing-icon-md)] items-center gap-x-2.5 px-3.5 py-3.5',
      )}
    >
      <input
        className="sr-only"
        type="radio"
        name="provider"
        value={provider.id}
        checked={checked}
        disabled={unavailable}
        aria-labelledby={`${id}-name`}
        aria-describedby={`${id}-status`}
        onChange={() => {
          if (!unavailable) {
            onSelect();
          }
        }}
      />
      <span
        className={cn(
          'flex size-7 items-center justify-center',
          unavailable && 'text-content-muted opacity-60 grayscale',
        )}
      >
        <SessionProviderIcon providerId={provider.icon} size="lg" />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span
          id={`${id}-name`}
          className={cn(
            'truncate text-title-md',
            unavailable ? 'text-content-secondary' : 'text-content-primary',
          )}
        >
          {provider.title}
        </span>
        {/* One line by contract: the status vocabulary is short enough at 375 and in three columns. */}
        <span
          id={`${id}-status`}
          className="flex h-4 items-center gap-1.5 overflow-hidden text-body-sm whitespace-nowrap text-content-secondary"
        >
          <AgentStatusGlyph provider={provider} demo={demo} />
          {agentStatusText(provider, demo, text)}
        </span>
      </span>
      <span className={cn(choiceSurfaceCheckClassName, !checked && 'invisible')} aria-hidden="true">
        <Icon name="check" size="sm" />
      </span>
    </label>
  );
}
