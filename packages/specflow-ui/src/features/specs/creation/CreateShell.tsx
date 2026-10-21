import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AppContent, AppContentContainer, AppWorkspace, AppWorkspaceBody } from '@nevo/ui';
import { useWorkspaceLabels } from '../../../app/navigation/useWorkspaceLabels';
import { applicationLocationHeader } from '../../../app/navigation/ApplicationLocation';

/** The Primary pane every Create state is shown in (loading, error and the form alike). */
export function CreateShell({
  specId,
  containerClassName,
  children,
}: {
  specId?: string;
  containerClassName?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const workspaceLabels = useWorkspaceLabels();
  return (
    <AppWorkspace fit="bounded" labels={workspaceLabels} scroll="content">
      <AppWorkspace.Primary
        header={applicationLocationHeader({
          title: specId ? t('create.newSession') : t('create.newSpecification'),
          view: specId ? 'new-session' : 'new-specification',
          specId,
        })}
      >
        <AppContent className="w-content-standard max-w-full">
          <AppWorkspaceBody scroll="area" padding="none">
            <div className="p-4 sm:p-6">
              <AppContentContainer size="standard" className={containerClassName}>
                {children}
              </AppContentContainer>
            </div>
          </AppWorkspaceBody>
        </AppContent>
      </AppWorkspace.Primary>
    </AppWorkspace>
  );
}
