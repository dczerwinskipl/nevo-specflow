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
import { createFormWidth } from './createFormLayout';
import { applicationLocationHeader } from '../../../app/navigation/ApplicationLocation';

/**
 * The Primary pane every Create state is shown in (loading, error, the method choice, the form and
 * its progress page alike). It uses the Focused frame (`fit="bounded"`), the same frame as the
 * Specifications list, so moving between them changes nothing. Inside it every state keeps one
 * reading column (`content-form`), left-aligned, so submitting the form never makes the page jump.
 * Only the two forms (`columns`) may use the frame's width: from a 992 px form column they lay out
 * two columns (`createFormColumns`); below it they keep the same reading column.
 */
export function CreateShell({
  specId,
  title,
  containerClassName,
  form,
  footer,
  columns = false,
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
  /**
   * The content lays out its own columns from the frame's width (the Create forms); the footer
   * follows the same threshold, so its button ends on the form's edge. Every other state, the
   * progress page included, stays at `content-form`.
   */
  columns?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const workspaceLabels = useWorkspaceLabels();
  // The scroll area spans the whole pane and the form column sits INSIDE it (the column must not wrap the
  // scroller, which would leave unscrollable side bands and put the scrollbar at the column's
  // edge instead of the pane's). The footer holds the same column, so its button stays aligned
  // with the content. The 16 px inset (`px-4`) is the one the header and the Specifications list
  // use, so moving between the Focused screens never shifts the content edge.
  const column = columns ? 'w-full px-4' : 'w-content-form max-w-full px-4';
  const container = columns ? ({ size: 'full', align: 'start' } as const) : {};
  const body = (
    <>
      {/* The gutter is reserved only at the end, so a classic (space-taking) scrollbar never
          shifts the left-aligned column away from the footer's, which reserves the same gutter.
          The bottom scroll padding is the footer's height: a field focused or revealed near the
          end of the form, and the message under it, stay clear of the pinned footer. */}
      <AppWorkspaceBody
        scroll="area"
        padding="none"
        className="[&>.scroll-area-viewport]:scroll-pb-shell-footer [&>.scroll-area-viewport]:[scrollbar-gutter:stable]"
      >
        <div className={cn(column, 'py-4 sm:py-6')}>
          <AppContentContainer {...container} className={containerClassName}>
            {children}
          </AppContentContainer>
        </div>
      </AppWorkspaceBody>
      {footer ? (
        <>
          {/* The same divider and shared shell footer height as the navigation's account row, so
              the two bars line up across the shell; taller only when the hint and the button stack
              on a narrow screen. */}
          <Separator />
          {/* The same end gutter as the scroll area (thin, stable), so both columns have one width
              and the button ends on the form's edge. */}
          <div className="flex min-h-shell-footer shrink-0 items-center overflow-hidden py-shell-footer-padding [scrollbar-gutter:stable] [scrollbar-width:thin]">
            <div className={column}>
              <AppContentContainer {...container}>
                {columns ? <div className={createFormWidth}>{footer}</div> : footer}
              </AppContentContainer>
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
