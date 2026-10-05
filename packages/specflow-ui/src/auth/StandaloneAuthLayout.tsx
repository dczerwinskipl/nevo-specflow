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
        className="flex min-h-dvh w-full flex-col text-content-primary sm:p-8"
        data-auth-layout="root"
      >
        <div
          className="@container flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] sm:hidden"
          data-auth-layout="mobile-header"
          {...designLayerMetadata({ layer: 'mobile-auth-header' })}
        >
          <NevoBrandLogo brand="nevo" product="SpecFlow" size="sm" type="horizontal" />
          <div
            className="ml-auto"
            data-auth-layout="mobile-language-selector"
            {...designLayerMetadata({ layer: 'language-selector' })}
          >
            <StandaloneLocaleMenu />
          </div>
        </div>

        <div
          className="flex min-h-0 flex-1 items-stretch justify-stretch sm:items-center sm:justify-center"
          data-auth-layout="body"
        >
          <WorkspaceSurface
            {...surfaceAttributes}
            as="main"
            className="h-full w-full overflow-y-auto rounded-t-surface border border-b-0 border-workspace-edge sm:h-auto sm:max-w-md sm:overflow-visible sm:rounded-surface sm:border-b sm:p-8"
            data-auth-layout="surface"
          >
            <div className="mx-auto w-full max-w-md p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-none sm:p-0">
              {children}
            </div>
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
