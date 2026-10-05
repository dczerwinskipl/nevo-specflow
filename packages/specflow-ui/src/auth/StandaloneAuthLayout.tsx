import type { ReactNode } from 'react';

import { DesignMetadataBoundary, designLayerMetadata } from '@nevo/figma-capture/metadata';
import { AppBackground, Typography, WorkspaceSurface } from '@nevo/ui';

import { defaultNevoBrand, NevoBrandLogo } from '../brand';
import { StandaloneLocaleMenu } from '../i18n';

type DesignAttributes = Readonly<Record<string, string>>;

export function StandaloneAuthSurface({
  children,
  rootAttributes,
  surfaceAttributes,
}: {
  readonly children: ReactNode;
  readonly rootAttributes?: DesignAttributes;
  readonly surfaceAttributes?: DesignAttributes;
}) {
  return (
    <DesignMetadataBoundary excludeComponents={['AppBackground', 'WorkspaceSurface']}>
      <AppBackground
        {...rootAttributes}
        brandPrimary={defaultNevoBrand.coreColor}
        className="flex min-h-dvh w-full flex-col text-content-primary"
        data-auth-layout="root"
      >
        <div
          className="flex shrink-0 items-center justify-between border-b border-divider pb-2 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(0.5rem,env(safe-area-inset-top))] sm:hidden"
          data-auth-layout="mobile-header"
          {...designLayerMetadata({ layer: 'mobile-auth-header' })}
        >
          <NevoBrandLogo brand="nevo" product="SpecFlow" size="sm" type="horizontal" />
          <div
            data-auth-layout="mobile-language-selector"
            {...designLayerMetadata({ layer: 'language-selector' })}
          >
            <StandaloneLocaleMenu />
          </div>
        </div>

        <div
          className="flex flex-1 items-center justify-center px-[max(1rem,env(safe-area-inset-left))] py-4 pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-[max(2rem,env(safe-area-inset-left))] sm:py-6 sm:pr-[max(2rem,env(safe-area-inset-right))] sm:pb-[max(2rem,env(safe-area-inset-bottom))]"
          data-auth-layout="body"
        >
          <WorkspaceSurface
            {...surfaceAttributes}
            as="main"
            className="w-full max-w-md rounded-surface border border-workspace-edge p-6 sm:p-8"
            data-auth-layout="surface"
          >
            {children}
          </WorkspaceSurface>
        </div>
      </AppBackground>
    </DesignMetadataBoundary>
  );
}

export function StandaloneAuthHeader({
  title,
  description,
}: {
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div className="grid gap-5 sm:gap-6">
      <div
        className="hidden items-center justify-between gap-4 sm:flex"
        data-auth-layout="desktop-header"
        {...designLayerMetadata({ layer: 'desktop-auth-header' })}
      >
        <NevoBrandLogo brand="nevo" product="SpecFlow" size="lg" type="horizontal" />
        <div
          data-auth-layout="desktop-language-selector"
          {...designLayerMetadata({ layer: 'language-selector' })}
        >
          <StandaloneLocaleMenu />
        </div>
      </div>
      <div className="grid gap-2">
        <Typography as="h1" variant="title-lg">
          {title}
        </Typography>
        <Typography className="text-content-secondary" variant="body-md">
          {description}
        </Typography>
      </div>
    </div>
  );
}
