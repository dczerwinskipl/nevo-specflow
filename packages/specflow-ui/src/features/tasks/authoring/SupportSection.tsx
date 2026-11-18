import type { ReactNode } from 'react';
import { Collapsible, Icon, useWorkspaceCapabilities, type IconName } from '@nevo/ui';
import { WorkspaceSection } from '../../../shared/workspace-section';
import { useSupportSectionChoice } from './supportSectionState';

/** How many items a section shows open by default: Documents rows, or Context / Depends on entries. */
export const OPEN_UP_TO = { documents: 3, entries: 4 } as const;

/**
 * Whether a supporting section starts open below Wide (UX contract, Full Task sections): when it
 * holds few items, or a blocker; otherwise it starts collapsed with its one-line summary.
 */
export function startsOpen(items: number, openUpTo: number, holdsBlocker: boolean): boolean {
  return holdsBlocker || items <= openUpTo;
}

export interface SupportSectionProps {
  /** Id of the section heading (its `aria-labelledby` target and link anchor). */
  readonly id: string;
  readonly title: string;
  /** The section icon of the Wide header. */
  readonly icon: IconName;
  /** The Task whose section this is: the user's toggle is kept per Task for the visit. */
  readonly taskId: string;
  /** The header meta while open (a count, "2 entries · default"). */
  readonly count?: number | string;
  /** The header meta while collapsed ("5 · task.md, plan.md, +3"); `count` when absent. */
  readonly summary?: string;
  /** The section's add action (`+`), beside the title. */
  readonly actions?: ReactNode;
  /** The rows or entries the section holds, and how many of them still start open. */
  readonly items: number;
  readonly openUpTo: number;
  /** A section that holds a blocker starts open whatever its size. */
  readonly holdsBlocker?: boolean;
  /** The section's dialogs: kept outside the panel, so the header actions open them while collapsed. */
  readonly dialogs?: ReactNode;
  readonly children: ReactNode;
}

/**
 * A supporting section of the Task page (Documents, Context, Depends on). Wide (the workspace can
 * split) shows an ordinary, always expanded section with its icon. Below that it is a disclosure
 * with the same spacing: open when it holds few items or a blocker, collapsed above that with the
 * summary in its header; the user's toggle wins for the rest of the visit.
 */
export function SupportSection({
  id,
  title,
  icon,
  taskId,
  count,
  summary,
  actions,
  items,
  openUpTo,
  holdsBlocker = false,
  dialogs,
  children,
}: SupportSectionProps) {
  const { supportsSplit } = useWorkspaceCapabilities();
  const [choice, choose] = useSupportSectionChoice(`${taskId}/${id}`);
  // Until the user toggles it, the default follows the live facts (a blocker appearing opens it).
  const open = choice ?? startsOpen(items, openUpTo, holdsBlocker);
  const meta = open ? count : (summary ?? count);

  if (supportsSplit) {
    return (
      <WorkspaceSection
        aria-labelledby={id}
        className="border-t border-border-default py-4 @min-[40rem]/task:py-5"
      >
        <WorkspaceSection.Header
          id={id}
          headingTag="h2"
          title={title}
          icon={icon}
          count={count}
          actions={actions}
        />
        {children}
        {dialogs}
      </WorkspaceSection>
    );
  }

  return (
    <section
      aria-labelledby={id}
      className="border-t border-border-default py-4 @min-[40rem]/task:py-5"
    >
      {/* Inline density: the chevron starts at the section edge and the panel is not indented. */}
      <Collapsible
        isExpanded={open}
        onExpandedChange={choose}
        showIndicator={false}
        density="inline"
        className="grid gap-2"
      >
        <div className="flex min-h-6 items-center justify-between gap-2">
          <h2 className="min-w-0 flex-1">
            <Collapsible.Trigger className="min-h-6 w-full">
              <span className="flex min-w-0 items-center gap-2">
                <Icon
                  name="chevron-right"
                  size="sm"
                  aria-hidden="true"
                  className="shrink-0 text-content-muted transition-transform [transition-duration:var(--motion-duration-fast)] group-data-[expanded]/collapsible:rotate-90 motion-reduce:transition-none"
                />
                <span id={id} className="text-section-label uppercase text-content-primary">
                  {title}
                </span>
                {meta !== undefined ? (
                  <span className="min-w-0 truncate text-body-sm text-content-muted">{meta}</span>
                ) : null}
              </span>
            </Collapsible.Trigger>
          </h2>
          {actions ? <div className="flex shrink-0 items-center">{actions}</div> : null}
        </div>
        {/* A collapsed panel holds nothing: hidden rows must not stay focusable. */}
        <Collapsible.Content>{open ? children : null}</Collapsible.Content>
      </Collapsible>
      {dialogs}
    </section>
  );
}
