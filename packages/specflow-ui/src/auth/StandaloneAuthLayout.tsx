import type { ReactNode } from 'react';

import { DesignMetadataBoundary, designLayerMetadata } from '@nevo/figma-capture/metadata';
import { AppBackground, Typography, WorkspaceSurface } from '@nevo/ui';

import { defaultNevoBrand, NevoBrandLogo } from '../brand';
import { StandaloneLocaleMenu } from '../i18n';
import './StandaloneAuthLayout.css';

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
        className="standalone-auth-root text-content-primary"
        data-auth-layout="root"
      >
        <div
          className="standalone-auth-mobile-header"
          data-auth-layout="mobile-header"
          {...designLayerMetadata({ layer: 'mobile-auth-header' })}
        >
          <NevoBrandLogo brand="nevo" product="SpecFlow" size="sm" type="horizontal" />
          <div
            className="standalone-auth-mobile-language"
            data-auth-layout="mobile-language-selector"
            {...designLayerMetadata({ layer: 'language-selector' })}
          >
            <StandaloneLocaleMenu />
          </div>
        </div>

        <div className="standalone-auth-body" data-auth-layout="body">
          <WorkspaceSurface
            {...surfaceAttributes}
            as="main"
            className="standalone-auth-surface border border-workspace-edge"
            data-auth-layout="surface"
          >
            <div className="standalone-auth-content">{children}</div>
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
    <div className="standalone-auth-screen-header">
      <div
        className="standalone-auth-desktop-header"
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
