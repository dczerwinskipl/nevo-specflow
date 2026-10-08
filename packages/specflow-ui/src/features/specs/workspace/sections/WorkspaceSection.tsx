import type { HTMLAttributes, ReactNode } from 'react';
import { Icon, Typography, cn, type IconName } from '@nevo/ui';

export interface WorkspaceSectionProps extends HTMLAttributes<HTMLElement> {
  readonly id?: string;
  readonly ariaLabelledby?: string;
  readonly className?: string;
  readonly children: ReactNode;
}

export interface WorkspaceSectionHeaderProps {
  readonly id?: string;
  readonly title: string;
  readonly icon?: IconName;
  readonly count?: number | string;
  readonly actions?: ReactNode;
  readonly className?: string;
  readonly headingTag?: 'h2' | 'h3' | 'h4' | 'span';
}

export function WorkspaceSectionHeader({
  id,
  title,
  icon,
  count,
  actions,
  className,
  headingTag = 'h3',
}: WorkspaceSectionHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-2.5 min-h-6', className)}>
      <div className="flex items-center gap-2 min-w-0">
        {icon ? (
          <span className="flex size-4 shrink-0 items-center justify-center text-content-muted">
            <Icon name={icon} size="sm" />
          </span>
        ) : null}
        <div className="flex items-baseline gap-2 min-w-0">
          <Typography
            as={headingTag}
            variant="section-label"
            id={id}
            className="text-content-primary"
          >
            {title}
          </Typography>
          {count !== undefined && count !== null ? (
            <span className="font-normal normal-case tracking-normal text-content-muted text-body-xs">
              {count}
            </span>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export interface WorkspaceSectionFooterProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function WorkspaceSectionFooter({ children, className }: WorkspaceSectionFooterProps) {
  if (!children) return null;
  return <div className={cn('pt-1 text-body-xs', className)}>{children}</div>;
}

export function WorkspaceSection({
  id,
  ariaLabelledby,
  className,
  children,
  ...rest
}: WorkspaceSectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={ariaLabelledby}
      className={cn('grid gap-2.5', className)}
      {...rest}
    >
      {children}
    </section>
  );
}

WorkspaceSection.Header = WorkspaceSectionHeader;
WorkspaceSection.Footer = WorkspaceSectionFooter;
