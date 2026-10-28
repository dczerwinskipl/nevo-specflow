import type { FormHTMLAttributes, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AppContent, AppContentContainer, AppWorkspace, AppWorkspaceBody } from '@nevo/ui';
import { useWorkspaceLabels } from '../../../app/navigation/useWorkspaceLabels';
import { applicationLocationHeader } from '../../../app/navigation/ApplicationLocation';

/**
 * The Primary pane every Create state is shown in (loading, error, the form and its progress page
 * alike). All of them share one content width (`content-form`, centred by the bounded
 * workspace), so submitting the form never makes the page jump.
 */
export function CreateShell({
  specId,
  title,
  containerClassName,
  form,
  footer,
  children,
}: {
  specId?: string;
  /** Names the page in the header and the breadcrumb; the default is the Create form's. */
  title?: string;
  containerClassName?: string;
  /**
   * Makes the pane one form: the scrolling content and the footer are both inside it, so the
   * footer's submit button submits it (also with Enter in a field).
   */
  form?: Omit<FormHTMLAttributes<HTMLFormElement>, 'children' | 'className'>;
  /**
   * Always visible at the bottom of the pane (the primary action and its hint); only the content
   * above it scrolls.
   */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const workspaceLabels = useWorkspaceLabels();
  const body = (
    <>
      <AppWorkspaceBody scroll="area" padding="none">
        <div className="p-4 sm:p-6">
          <AppContentContainer className={containerClassName}>{children}</AppContentContainer>
        </div>
      </AppWorkspaceBody>
      {footer ? (
        <div className="shrink-0 border-t border-border-subtle px-4 py-3 sm:px-6">
          <AppContentContainer>{footer}</AppContentContainer>
        </div>
      ) : null}
    </>
  );
  return (
    <AppWorkspace fit="bounded" labels={workspaceLabels} scroll="content">
      <AppWorkspace.Primary
        header={applicationLocationHeader({
          title: title ?? (specId ? t('create.newSession') : t('create.newSpecification')),
          view: specId ? 'new-session' : 'new-specification',
          specId,
        })}
      >
        <AppContent className="w-content-form max-w-full">
          {form ? (
            <form {...form} className="flex min-h-0 flex-1 flex-col">
              {body}
            </form>
          ) : (
            body
          )}
        </AppContent>
      </AppWorkspace.Primary>
    </AppWorkspace>
  );
}
