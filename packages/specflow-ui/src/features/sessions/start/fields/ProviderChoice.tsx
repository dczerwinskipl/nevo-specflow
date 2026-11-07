import { cn, StatusIndicator, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { useMessage } from '../../../../i18n/message';
import { ChoiceTile, ChoiceTileGroup } from '../../../../shared/controls/ChoiceTile';
import { SessionProviderIcon } from '../../shared/SessionProviderIcon';
import type { StartCatalogue } from '../catalogue/startCatalogue';
import { providerStatus } from './providerStatus';

/**
 * Which agent runs the Session: one tile per catalogue provider. Chosen only when a Session starts —
 * the provider is fixed for the life of a Session, so the Composer never offers this choice.
 */
export function ProviderChoice({
  catalogue,
  providerId,
  labelledBy,
  onSelect,
  invalid = false,
  describedBy,
}: {
  catalogue: StartCatalogue;
  providerId: string;
  /** The heading/legend that names the group. */
  labelledBy: string;
  onSelect: (providerId: string) => void;
  /** The choice blocks the owner's form; `describedBy` is the message that says why. */
  invalid?: boolean;
  describedBy?: string;
}) {
  const { t } = useTranslation();
  const text = useMessage();
  const { providers } = catalogue;
  const columns = cn(
    providers.length === 3 ? '@2xl:grid-cols-3' : providers.length > 1 && '@lg:grid-cols-2',
    providers.length >= 5 && '@2xl:grid-cols-3',
  );

  if (providers.length === 0) {
    return (
      <Typography as="p" variant="body-sm" className="text-content-secondary">
        {t('create.agent.noProviders')}
      </Typography>
    );
  }

  return (
    <ChoiceTileGroup
      aria-labelledby={labelledBy}
      columns={columns}
      invalid={invalid}
      describedBy={describedBy}
    >
      {providers.map((p) => {
        const status = providerStatus(p, catalogue);

        return (
          <ChoiceTile
            key={p.id}
            name="provider"
            value={p.id}
            checked={providerId === p.id}
            disabled={!p.available}
            onSelect={() => onSelect(p.id)}
            icon={<SessionProviderIcon providerId={p.icon} />}
            title={p.title}
            description={status.access ? text(status.access) : undefined}
            meta={
              p.available ? (
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  {status.tone && <StatusIndicator tone={status.tone} />}
                  {text(status.availability)}
                </span>
              ) : (
                <span>{text(status.availability)}</span>
              )
            }
            note={status.note ? text(status.note) : undefined}
          />
        );
      })}
    </ChoiceTileGroup>
  );
}
