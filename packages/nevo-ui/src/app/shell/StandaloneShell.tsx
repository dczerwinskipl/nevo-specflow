import type { HTMLAttributes, ReactNode } from 'react';

import {
  DesignMetadataBoundary,
  designSlot,
  useDesignMetadata,
} from '@nevo/figma-capture/metadata';

import {
  AppBackground,
  type AppBackgroundProps,
  WorkspaceSurface,
  type WorkspaceSurfaceProps,
} from '../../components/foundations/Environment';
import { cn } from '../../lib';

export interface StandaloneShellProps extends Omit<
  AppBackgroundProps,
  'brandPrimary' | 'children'
> {
  brandPrimary?: string;
  mobileHeader?: ReactNode;
  desktopHeader?: ReactNode;
  children: ReactNode;
  surfaceProps?: Omit<WorkspaceSurfaceProps, 'as' | 'children'>;
  contentProps?: HTMLAttributes<HTMLDivElement>;
}

export function StandaloneShell({
  brandPrimary,
  mobileHeader,
  desktopHeader,
  children,
  className,
  surfaceProps,
  contentProps,
  ...props
}: StandaloneShellProps) {
  const capture = useDesignMetadata('StandaloneShell', {});
  const { className: surfaceClassName, ...restSurfaceProps } = surfaceProps ?? {};
  const { className: contentClassName, ...restContentProps } = contentProps ?? {};

  return (
    <DesignMetadataBoundary excludeComponents={['AppBackground', 'WorkspaceSurface']}>
      <AppBackground
        brandPrimary={brandPrimary}
        className={cn('standalone-shell-root', className)}
        {...props}
        {...capture}
        data-standalone-shell-region="root"
      >
        {mobileHeader ? (
          <div
            className="standalone-shell-mobile-header"
            data-standalone-shell-region="mobile-header"
            {...designSlot('StandaloneShell', 'mobileHeader')}
          >
            {mobileHeader}
          </div>
        ) : null}

        <div className="standalone-shell-body" data-standalone-shell-region="body">
          <WorkspaceSurface
            {...restSurfaceProps}
            as="main"
            className={cn(
              'standalone-shell-surface border border-workspace-edge',
              surfaceClassName,
            )}
            data-standalone-shell-region="surface"
          >
            <div
              {...restContentProps}
              className={cn('standalone-shell-content', contentClassName)}
              data-standalone-shell-region="content"
              {...designSlot('StandaloneShell', 'content')}
            >
              {desktopHeader ? (
                <div
                  className="standalone-shell-desktop-header"
                  data-standalone-shell-region="desktop-header"
                  {...designSlot('StandaloneShell', 'desktopHeader')}
                >
                  {desktopHeader}
                </div>
              ) : null}
              {children}
            </div>
          </WorkspaceSurface>
        </div>
      </AppBackground>
    </DesignMetadataBoundary>
  );
}
