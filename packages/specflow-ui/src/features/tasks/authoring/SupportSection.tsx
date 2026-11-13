import type { ReactNode } from 'react';
import { Collapsible, type IconName } from '@nevo/ui';
import { WorkspaceSection } from '../../../shared/workspace-section';

export interface SupportSectionProps {
  /** Id of the section heading (its `aria-labelledby` target and link anchor). */
  readonly id: string;
  readonly title: string;
  readonly icon: IconName;
  readonly count?: number | string;
  /** The section's add action (`+`), beside the title at every width. */
  readonly actions?: ReactNode;
  /** Narrow: a disclosure whose trigger is the title and the count. */
  readonly collapsible: boolean;
  /** A section that holds a blocker opens by default (UX contract, Narrow). */
  readonly holdsBlocker?: boolean;
  readonly children: ReactNode;
}

/**
 * A supporting section of the Task page (Documents, Context, Depends on). Wide and Compact show an
 * ordinary workspace section; Narrow shows a disclosure, collapsed unless it holds a blocker.
 */
export function SupportSection({
  id,
  title,
  icon,
  count,
  actions,
  collapsible,
  holdsBlocker = false,
  children,
}: SupportSectionProps) {
  if (!collapsible) {
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
      </WorkspaceSection>
    );
  }

  return (
    // Remounted when a blocker appears or goes, so the default follows it.
    <section
      key={holdsBlocker ? 'blocker' : 'clear'}
      aria-labelledby={id}
      className="border-t border-border-default py-3"
    >
      <Collapsible defaultExpanded={holdsBlocker} className="grid gap-2">
        <div className="flex min-h-6 items-center justify-between gap-2">
          <h2 className="min-w-0 flex-1">
            <Collapsible.Trigger className="w-full px-0">
              <span id={id} className="text-section-label uppercase text-content-primary">
                {title}
              </span>
              {count !== undefined ? (
                <span className="ml-2 text-body-sm text-content-muted">{count}</span>
              ) : null}
            </Collapsible.Trigger>
          </h2>
          {actions ? <div className="flex shrink-0 items-center">{actions}</div> : null}
        </div>
        <Collapsible.Content>{children}</Collapsible.Content>
      </Collapsible>
    </section>
  );
}
