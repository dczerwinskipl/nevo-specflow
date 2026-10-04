import { useState } from 'react';

import { Button } from '@nevo/ui';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();

  return (
    <StandaloneAuthSurface>
      <div className="grid w-full gap-8">
        <StandaloneAuthHeader
          description={t('auth.runtimeUnavailable.description')}
          title={t('auth.runtimeUnavailable.title')}
        />
        <Button aria-busy={retrying} disabled={retrying} width="full" onClick={onRetry}>
          {retrying ? t('common.retrying') : t('common.retry')}
        </Button>
      </div>
    </StandaloneAuthSurface>
  );
}
