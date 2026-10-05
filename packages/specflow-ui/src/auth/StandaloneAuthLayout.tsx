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
        className="flex min-h-dvh w-full flex-col pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] text-content-primary sm:pb-[max(2rem,env(safe-area-inset-bottom))] sm:pl-[max(2rem,env(safe-area-inset-left))] sm:pr-[max(2rem,env(safe-area-inset-right))] sm:pt-[max(1.5rem,env(safe-area-inset-top))]"
        data-auth-layout="root"
      >
        <div
          className="flex shrink-0 justify-end"
          data-auth-layout="language-selector"
          {...designLayerMetadata({ layer: 'language-selector' })}
        >
          <StandaloneLocaleMenu />
        </div>
        <div
          className="flex flex-1 items-center justify-center py-4 sm:py-6"
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
    <div className="grid gap-6">
      <NevoBrandLogo brand="nevo" product="SpecFlow" size="lg" type="horizontal" />
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
