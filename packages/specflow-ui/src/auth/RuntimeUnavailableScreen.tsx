import { useState } from 'react';

import { Alert, Button, Typography } from '@nevo/ui';

import { NevoBrandLogo } from '../brand';
import type { AuthStore } from './store';
import { safeReturnTo } from './LoginScreen';

export function RuntimeUnavailableScreen({
  auth,
  returnTo = '/',
}: {
  readonly auth: AuthStore;
  readonly returnTo?: string;
}) {
  const [retrying, setRetrying] = useState(false);
  const retry = async () => {
    setRetrying(true);
    try {
      await auth.refresh();
      window.location.assign(safeReturnTo(returnTo));
    } catch {
      setRetrying(false);
    }
  };

  return (
    <div className="min-h-dvh bg-surface text-content-primary">
      <main className="mx-auto grid min-h-dvh w-full max-w-md content-start gap-8 px-5 pb-10 pt-12 sm:content-center sm:px-8 sm:py-12">
        <NevoBrandLogo brand="nevo" product="SpecFlow" size="lg" type="horizontal" />
        <div className="grid gap-2">
          <Typography as="h1" variant="title-lg">
            Unable to connect
          </Typography>
          <Typography className="text-content-secondary" variant="body-md">
            SpecFlow Runtime did not respond. Check that it is running, then try again.
          </Typography>
        </div>
        <Alert tone="danger" title="Runtime unavailable">
          Authentication state could not be loaded, so SpecFlow cannot safely open the application.
        </Alert>
        <Button aria-busy={retrying} disabled={retrying} width="full" onClick={() => void retry()}>
          {retrying ? 'Retrying…' : 'Retry'}
        </Button>
      </main>
    </div>
  );
}
