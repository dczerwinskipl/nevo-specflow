import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button } from '@nevo/ui';
import { ApplicationContextLine } from '../../../app/navigation/ApplicationLocation';
import { runtimeKeys, useRuntimeMode } from '../../../app/useRuntimeMode';
import { CreateShell } from './CreateShell';

/**
 * The shell a Create screen shows while it has no flow to render: loading, unavailable or a
 * feature the connected Runtime does not offer. `view` adds the location line (a Session or a new
 * specification); without it the shell carries no line.
 */
export function CreateFallback({
  specId,
  view,
  children,
}: {
  specId?: string;
  view?: 'new-session' | 'new-specification';
  children: ReactNode;
}) {
  return (
    <CreateShell specId={specId} containerClassName="grid gap-6">
      {view && <ApplicationContextLine className="mb-0" specId={specId} view={view} />}
      {children}
    </CreateShell>
  );
}

/**
 * The Runtime mode gate shared by the Create screens: while the mode loads or its read failed
 * (retry), a calm fallback; once known, `children` renders the flow of that mode.
 */
export function CreateRuntimeGate({
  specId,
  view,
  children,
}: {
  specId?: string;
  view?: 'new-session' | 'new-specification';
  children: (mode: 'project' | 'demo') => ReactNode;
}) {
  const { t } = useTranslation();
  const mode = useRuntimeMode();
  const queryClient = useQueryClient();
  if (mode === 'loading') {
    return (
      <CreateFallback specId={specId} view={view}>
        <p role="status">{t('create.loading')}</p>
      </CreateFallback>
    );
  }

  if (mode === 'unavailable') {
    return (
      <CreateFallback specId={specId} view={view}>
        <Alert tone="attention" title={t('create.loadError')}>
          <Button
            onClick={() => void queryClient.invalidateQueries({ queryKey: runtimeKeys.info })}
          >
            {t('common.retry')}
          </Button>
        </Alert>
      </CreateFallback>
    );
  }

  return <>{children(mode)}</>;
}
