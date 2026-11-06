import type { FormHTMLAttributes, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  layoutPrototype,
  createColumnWidthClass,
  progressAlign,
  isA3Family,
} from '../../../app/layoutPrototype';
import {
  AppContent,
  AppContentContainer,
  AppWorkspace,
  AppWorkspaceBody,
  Separator,
  WorkspaceHeader,
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
  preview,
  contentWidth,
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
  /** PROTOTYPE (variant E): the Secondary preview of what the form will create. */
  preview?: ReactNode;
  /** PROTOTYPE (A3): keep this page's content at `content-form` inside the shared frame. */
  contentWidth?: 'form';
}) {
  const { t } = useTranslation();
  const workspaceLabels = useWorkspaceLabels();
  const withPreview = layoutPrototype === 'E' && Boolean(preview);
  // The scroll area spans the whole pane and the form column is centred INSIDE it (the column must not wrap the
  // scroller, which would leave unscrollable side bands and put the scrollbar at the column's
  // edge instead of the pane's). The footer centres the same column, so
  // its button stays aligned with the content.
  const column = cn(
    'mx-auto max-w-full px-4 sm:px-6',
    layoutPrototype === 'A' ||
      layoutPrototype === 'A2' ||
      layoutPrototype === 'A3' ||
      layoutPrototype === 'A3h' ||
      layoutPrototype === 'C'
      ? createColumnWidthClass[layoutPrototype]
      : layoutPrototype === 'B'
        ? 'w-full sm:px-8'
        : layoutPrototype === 'E'
          ? 'w-content-standard'
          : 'w-content-form',
  );
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
          <AppContentContainer
            className={cn(
              containerClassName,
              isA3Family && contentWidth === 'form'
                ? cn('max-w-content-form', progressAlign === 'center' && 'mx-auto')
                : undefined,
            )}
            size={layoutPrototype === 'base' || layoutPrototype === 'D' ? undefined : 'full'}
          >
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
          <div
            className={cn(
              'flex min-h-shell-footer shrink-0 items-center py-shell-footer-padding',
              // PROTOTYPE (A3): the same both-edge gutter as the scrolling body keeps the button
              // aligned with the form edge.
              isA3Family && 'overflow-hidden [scrollbar-gutter:stable_both-edges]',
            )}
          >
            <div className={column}>
              <AppContentContainer
                size={layoutPrototype === 'base' || layoutPrototype === 'D' ? undefined : 'full'}
              >
                {footer}
              </AppContentContainer>
            </div>
          </div>
        </>
      ) : null}
    </>
  );

  return (
    <AppWorkspace
      fit={layoutPrototype === 'B' || withPreview ? 'available' : 'bounded'}
      split={withPreview ? 'primary' : undefined}
      labels={workspaceLabels}
      scroll="content"
    >
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
      {withPreview ? (
        <AppWorkspace.Secondary
          header={<WorkspaceHeader as="h2" title={t('createPreviewPrototype.panelTitle')} />}
        >
          <AppContent>
            <AppWorkspaceBody padding="none" scroll="area">
              {preview}
            </AppWorkspaceBody>
          </AppContent>
        </AppWorkspace.Secondary>
      ) : null}
    </AppWorkspace>
  );
}
