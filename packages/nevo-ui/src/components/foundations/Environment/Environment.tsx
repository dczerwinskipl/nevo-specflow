import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import {
  appBackgroundClassName,
  brandEnvironmentStyle,
  workspaceSurfaceClassName,
} from '../../../design-system/brandEnvironment';
import { useDesignMetadata } from '@nevo/figma-capture/metadata';
import { cn } from '../../../lib';

export interface AppBackgroundProps extends HTMLAttributes<HTMLDivElement> {
  brandPrimary?: string;
}

export const AppBackground = forwardRef<HTMLDivElement, AppBackgroundProps>(function AppBackground(
  { brandPrimary, className, style, ...props },
  ref,
) {
  const metadata = useDesignMetadata('AppBackground', {});

  return (
    <div
      ref={ref}
      className={cn(appBackgroundClassName, className)}
      style={{ ...brandEnvironmentStyle(brandPrimary), ...style }}
      {...props}
      {...metadata}
    />
  );
});

export interface WorkspaceSurfaceProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'main' | 'section';
  blur?: boolean;
}

export function WorkspaceSurface({
  as: Component = 'div',
  blur = true,
  className,
  ...props
}: WorkspaceSurfaceProps) {
  const metadata = useDesignMetadata('WorkspaceSurface', {});

  return (
    <Component
      className={cn(workspaceSurfaceClassName, blur && 'backdrop-blur-sm', className)}
      {...props}
      {...metadata}
    />
  );
}

export interface WorkspaceSurfacePreviewProps {
  children: ReactNode;
  className?: string;
}

export function WorkspaceSurfacePreview({ children, className }: WorkspaceSurfacePreviewProps) {
  return (
    <AppBackground className="min-h-screen w-full p-6">
      <WorkspaceSurface
        className={cn(
          'mx-auto min-h-[20rem] w-full max-w-6xl rounded-surface border border-workspace-edge p-6',
          className,
        )}
      >
        {children}
      </WorkspaceSurface>
    </AppBackground>
  );
}
