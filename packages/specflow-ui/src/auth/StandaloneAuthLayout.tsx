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
        className="relative flex min-h-dvh w-full items-center justify-center px-4 py-6 text-content-primary sm:px-8 sm:py-10"
        data-auth-layout="root"
      >
        <div
          className="absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))] sm:right-8 sm:top-6"
          {...designLayerMetadata({ layer: 'language-selector' })}
        >
          <StandaloneLocaleMenu />
        </div>
        <WorkspaceSurface
          {...surfaceAttributes}
          as="main"
          className="w-full max-w-md rounded-surface border border-workspace-edge p-6 sm:p-8"
          data-auth-layout="surface"
        >
          {children}
        </WorkspaceSurface>
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
