import { useTranslation } from 'react-i18next';
import { AppContent, AppWorkspace, Button } from '@nevo/ui';
import { StandaloneScreenHeader } from '../../../../app/StandaloneScreenLayout';
import { useWorkspaceLabels } from '../../../../app/navigation/useWorkspaceLabels';

/**
 * A Session that was deleted (here or in another view) or never existed (session-actions-ux §3.6):
 * the product's not-found composition (`NotFoundView`: header, description, one secondary button)
 * with one way on to a new Session. It replaces the Session screen inside the application shell,
 * in the workspace the Session screen used, rather than opening a second standalone shell (which
 * would nest a second `main` landmark in the shell's).
 */
export function SessionNotFoundView({ onNewSession }: { onNewSession?: () => void }) {
  const { t } = useTranslation();
  const labels = useWorkspaceLabels();

  return (
    <AppWorkspace fit="available" labels={labels}>
      <AppWorkspace.Primary>
        <AppContent className="mx-auto grid w-full max-w-content-narrow content-start gap-8 px-5 py-10">
          <StandaloneScreenHeader
            title={t('managedSession.notFound.title')}
            description={t('managedSession.notFound.description')}
          />
          {onNewSession ? (
            <div>
              <Button variant="secondary" onClick={onNewSession}>
                {t('managedSession.notFound.action')}
              </Button>
            </div>
          ) : null}
        </AppContent>
      </AppWorkspace.Primary>
    </AppWorkspace>
  );
}
