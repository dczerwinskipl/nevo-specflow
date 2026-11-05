import { useTranslation } from 'react-i18next';
import { EmptyState } from '@nevo/ui';
import { SessionProviderIcon } from '../../shared/SessionProviderIcon';

/**
 * The conversation of a Session that has no message yet (new-session-ui-spec.md, section 5): the
 * agent's logo at the empty state's large glyph size, that the agent is ready and that writing a
 * message starts the conversation. Names the provider only; the model and work mode are visible in
 * the Composer right below. The provider's colour logo is kept as it is.
 */
export function SessionReadyEmptyState({
  providerId,
  providerTitle,
}: {
  providerId?: string;
  providerTitle: string;
}) {
  const { t } = useTranslation();

  return (
    <EmptyState
      variant="pane"
      icon={<SessionProviderIcon providerId={providerId} size="xl" />}
      title={t('managedSession.readyState.title', { provider: providerTitle })}
      description={t('managedSession.readyState.description')}
    />
  );
}
