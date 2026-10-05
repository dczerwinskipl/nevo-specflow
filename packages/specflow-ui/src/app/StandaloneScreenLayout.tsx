import type { ReactNode } from 'react';

import { DesignMetadataBoundary } from '@nevo/figma-capture/metadata';
import { Typography, StandaloneShell } from '@nevo/ui';

import { defaultNevoBrand, NevoBrandLogo } from '../brand';
import { StandaloneLocaleMenu } from '../i18n';

type DesignAttributes = Readonly<Record<string, string>>;

export function SpecFlowStandaloneShell({
  children,
  rootAttributes,
  surfaceAttributes,
}: {
  readonly children: ReactNode;
  readonly rootAttributes?: DesignAttributes;
  readonly surfaceAttributes?: DesignAttributes;
}) {
  return (
    <DesignMetadataBoundary excludeComponents={['StandaloneShell']}>
      <StandaloneShell
        {...rootAttributes}
        brandPrimary={defaultNevoBrand.coreColor}
        desktopHeader={
          <>
            <NevoBrandLogo brand="nevo" product="SpecFlow" size="lg" type="horizontal" />
            <StandaloneLocaleMenu />
          </>
        }
        mobileHeader={
          <>
            <NevoBrandLogo brand="nevo" product="SpecFlow" size="sm" type="horizontal" />
            <StandaloneLocaleMenu />
          </>
        }
        surfaceProps={surfaceAttributes}
      >
        {children}
      </StandaloneShell>
    </DesignMetadataBoundary>
  );
}

export function StandaloneScreenHeader({
  title,
  description,
}: {
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div className="grid gap-2">
      <Typography as="h1" variant="title-lg">
        {title}
      </Typography>
      <Typography className="text-content-secondary" variant="body-md">
        {description}
      </Typography>
    </div>
  );
}
