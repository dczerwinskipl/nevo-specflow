import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { AppShell, Typography } from '@nevo/ui';
import { Link } from '@tanstack/react-router';
import type { PropsWithChildren } from 'react';

import { NevoBrandLogo } from '../brand';

function ProductNavigation() {
  const linkClassName =
    'block rounded-control px-3 py-2 text-content-secondary hover:bg-surface-hover hover:text-content-primary';

  return (
    <div className="flex h-full flex-col px-3 py-5">
      <NevoBrandLogo brand="nevo" product="SpecFlow" size="md" type="horizontal" />
      <nav aria-label="Product navigation" className="mt-8 grid gap-1">
        <Link activeProps={{ className: `${linkClassName} bg-surface-selected` }} className={linkClassName} to="/">
          Home
        </Link>
        <Link
          activeProps={{ className: `${linkClassName} bg-surface-selected` }}
          className={linkClassName}
          to="/ui-playground"
        >
          UI Playground
        </Link>
      </nav>
      <Typography className="mt-auto text-content-muted" variant="body-sm">
        Nevo SpecFlow
      </Typography>
    </div>
  );
}

export function SpecFlowShell({ children }: PropsWithChildren) {
  const capture = useDesignMetadata('SpecFlowApplicationShell', { viewport: 'desktop' });

  return (
    <div className="h-dvh w-full" {...capture}>
      <div className="h-full" {...designSlot('SpecFlowApplicationShell', 'shell')}>
        <AppShell brandPrimary="#2b6bff" navigation={<ProductNavigation />}>
          {children}
        </AppShell>
      </div>
    </div>
  );
}
