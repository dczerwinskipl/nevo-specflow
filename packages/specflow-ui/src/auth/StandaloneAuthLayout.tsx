import type { ReactNode } from 'react';

import { AppBackground, Typography, WorkspaceSurface } from '@nevo/ui';

import { defaultNevoBrand, NevoBrandLogo } from '../brand';

export function StandaloneAuthSurface({ children }: { readonly children: ReactNode }) {
  return (
    <AppBackground
      brandPrimary={defaultNevoBrand.coreColor}
      className="flex min-h-dvh w-full items-center justify-center px-4 py-6 text-content-primary sm:px-8 sm:py-10"
    >
      <WorkspaceSurface
        as="main"
        className="w-full max-w-md rounded-surface border border-workspace-edge p-6 sm:p-8"
      >
        {children}
      </WorkspaceSurface>
    </AppBackground>
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
