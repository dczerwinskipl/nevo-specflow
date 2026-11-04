import type { FormHTMLAttributes, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AppContent,
  AppContentContainer,
  AppWorkspace,
  AppWorkspaceBody,
  Separator,
  cn,
} from '@nevo/ui';
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
  // The scroll area spans the whole pane and the form column is centred INSIDE it (the column must not wrap the
  // scroller, which would leave unscrollable side bands and put the scrollbar at the column's
  // edge instead of the pane's). The footer centres the same column, so
  // its button stays aligned with the content.
  const column = 'mx-auto w-content-form max-w-full px-4 sm:px-6';
  const body = (
    <>
      {/* The gutter is reserved on both edges so a classic (space-taking) scrollbar keeps the
          column centred exactly like the footer's, which has no scrollbar. */}
      <AppWorkspaceBody
        scroll="area"
        padding="none"
        className="[&>.scroll-area-viewport]:[scrollbar-gutter:stable_both-edges]"
      >
        <div className={cn(column, 'py-4 sm:py-6')}>
          <AppContentContainer className={containerClassName}>{children}</AppContentContainer>
        </div>
      </AppWorkspaceBody>
      {footer ? (
        <>
          {/* The same divider and shared shell footer height as the navigation's account row, so
              the two bars line up across the shell; taller only when the hint and the button stack
              on a narrow screen. */}
          <Separator />
          <div className="flex min-h-shell-footer shrink-0 items-center py-shell-footer-padding">
            <div className={column}>
              <AppContentContainer>{footer}</AppContentContainer>
            </div>
          </div>
        </>
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
        <AppContent className="w-full">
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
