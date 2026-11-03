import { useTranslation } from 'react-i18next';
import { InformationList, Typography } from '@nevo/ui';
import { SessionProviderIcon } from '../../shared/SessionProviderIcon';
import { ContextNavigationRow } from './ContextNavigationRow';
import type { SessionExecutor } from './sessionContextTypes';

/**
 * Context's first section (owner review: "jako pierwszy element chciałbym widzieć Claude /
 * Antigravity… + wybrany model"): one static identity row, provider icon and name, with the model
 * and effort as its secondary line. Static (no chevron): changing the model stays the composer's
 * job.
 */
export function ContextExecutorSection({ executor }: { executor: SessionExecutor }) {
  const { t } = useTranslation();
  const model = executor.modelTitle
    ? executor.effort
      ? `${executor.modelTitle} · ${executor.effort}`
      : executor.modelTitle
    : undefined;

  return (
    <section className="grid gap-1">
      <Typography variant="section-label">{t('sessions.context.executor')}</Typography>
      <InformationList>
        <ContextNavigationRow
          leading={<SessionProviderIcon providerId={executor.providerId} />}
          emphasis="identity"
          label={executor.providerTitle}
          secondary={model}
        />
      </InformationList>
    </section>
  );
}
