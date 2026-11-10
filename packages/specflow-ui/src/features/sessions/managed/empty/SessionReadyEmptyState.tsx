import { useTranslation } from 'react-i18next';
import { EmptyState } from '@nevo/ui';
import { SessionProviderIcon } from '../../shared/SessionProviderIcon';

/**
 * The conversation of a Session that has no message yet (full-session.md "Starting a Session"): the
 * agent's logo at the empty state's large glyph size, that the agent is ready and that writing a
 * message starts the conversation. Names the provider only; the model and work mode are visible in
 * the Composer right below. The provider's colour logo is kept as it is. A view-only Session has
 * no Composer, so it only says there are no messages, with no call to action.
 */
export function SessionReadyEmptyState({
  providerId,
  providerTitle,
  viewOnly = false,
}: {
  providerId?: string;
  providerTitle: string;
  viewOnly?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <EmptyState
      variant="pane"
      icon={<SessionProviderIcon providerId={providerId} size="xl" />}
      title={
        viewOnly
          ? t('managedSession.viewOnly.empty')
          : t('managedSession.readyState.title', { provider: providerTitle })
      }
      {...(viewOnly ? {} : { description: t('managedSession.readyState.description') })}
    />
  );
}
