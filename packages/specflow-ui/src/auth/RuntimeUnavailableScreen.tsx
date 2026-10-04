import { useState } from 'react';

import { Button } from '@nevo/ui';

import type { AuthStore } from './store';
import { safeReturnTo } from './LoginScreen';
import { StandaloneAuthHeader, StandaloneAuthSurface } from './StandaloneAuthLayout';

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

  return <RuntimeUnavailableView retrying={retrying} onRetry={() => void retry()} />;
}

export function RuntimeUnavailableView({
  retrying = false,
  onRetry,
}: {
  readonly retrying?: boolean;
  readonly onRetry?: () => void;
}) {
  return (
    <StandaloneAuthSurface>
      <div className="grid w-full gap-8">
        <StandaloneAuthHeader
          description="SpecFlow Runtime did not respond. Make sure it is running and reachable, then try again."
          title="Unable to connect"
        />
        <Button aria-busy={retrying} disabled={retrying} width="full" onClick={onRetry}>
          {retrying ? 'Retrying…' : 'Retry'}
        </Button>
      </div>
    </StandaloneAuthSurface>
  );
}
