import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { InformationList } from '@nevo/ui';
import { SessionProviderIcon } from '../../shared/SessionProviderIcon';
import { ContextNavigationRow } from './ContextNavigationRow';
import { ContextNote, ContextSection, ContextSkeletonRows } from './ContextSectionFrame';
import { isRequired, resolveSection } from './sessionContextAvailability';
import type { ContextFact, SessionExecutor, SessionScope } from './sessionContextTypes';

/**
 * Context's first section: one static identity row, provider icon and name, with the model
 * and effort as its secondary line. Static (no chevron): changing the model stays the composer's
 * job. The executor is always required: loading shows a skeleton row, unreadable a warning,
 * missing an error. `children` is the panel-level note that sits right under it (the scope note).
 */
export function ContextExecutorSection({
  executor,
  scope,
  children,
}: {
  executor?: ContextFact<SessionExecutor>;
  scope: SessionScope;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const resolved = resolveSection(executor, isRequired('executor', scope));
  if (resolved.kind === 'omit') {
    return children ? <div className="grid gap-1">{children}</div> : null;
  }

  return (
    <ContextSection title={t('sessions.context.executor')} busy={resolved.kind === 'skeleton'}>
      {resolved.kind === 'skeleton' && <ContextSkeletonRows rows={['identity']} />}
      {resolved.kind === 'ready' && <ExecutorRow executor={resolved.value} />}
      {(resolved.kind === 'warning' || resolved.kind === 'error') && (
        <ContextNote kind={resolved.kind}>
          {t(
            resolved.kind === 'error'
              ? 'sessions.context.availability.executorMissing'
              : 'sessions.context.availability.executorUnreadable',
          )}
        </ContextNote>
      )}
      {children}
    </ContextSection>
  );
}

function ExecutorRow({ executor }: { executor: SessionExecutor }) {
  const model = executor.modelTitle
    ? executor.effort
      ? `${executor.modelTitle} · ${executor.effort}`
      : executor.modelTitle
    : undefined;

  return (
    <InformationList>
      <ContextNavigationRow
        leading={<SessionProviderIcon providerId={executor.providerId} />}
        emphasis="identity"
        label={executor.providerTitle}
        secondary={model}
      />
    </InformationList>
  );
}
