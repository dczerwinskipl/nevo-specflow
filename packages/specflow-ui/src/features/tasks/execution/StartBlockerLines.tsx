import { useTranslation } from 'react-i18next';
import { InlineNote, Typography } from '@nevo/ui';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { GateList } from './GateList';
import { InlineAction } from './InlineAction';

type Position = WorkflowActionProjection['position'];
export type StartBlocker = Extract<Position, { kind: 'blocked' }>['blockers'][number];

/** Where the page lets the reader fix a blocker (each a section heading of the page). */
export interface NowLinks {
  readonly tasks?: () => void;
  readonly context?: () => void;
  readonly dependencies?: () => void;
}

/**
 * Why the next step cannot start, one line each with a link to where it is fixed. The subject's own
 * status (draft, on hold, cancelled) is not repeated: the status line and the primary action carry it.
 */
export function StartBlockerLines({
  blockers,
  links,
}: {
  readonly blockers: readonly StartBlocker[];
  readonly links: NowLinks;
}) {
  const { t } = useTranslation();
  const see = (label: string, go: (() => void) | undefined) =>
    go ? (
      <>
        {' '}
        <InlineAction className="ml-1" onClick={go}>
          {label}
        </InlineAction>
      </>
    ) : null;

  return blockers.map((blocker, index) => {
    const key = `${blocker.kind}-${index}`;
    switch (blocker.kind) {
      case 'status':
        return null;
      case 'dependencies':
        return (
          <div key={key} className="grid gap-1">
            {blocker.waitingFor.length > 0 ? (
              <InlineNote tone="attention" icon="clock">
                <span className="font-medium text-content-primary">
                  {t('workflowExecution.blocker.dependencies', {
                    count: blocker.waitingFor.length,
                  })}
                </span>
                {see(t('workflowExecution.blocker.seeDependencies'), links.dependencies)}
              </InlineNote>
            ) : null}
            {blocker.unsatisfiable.length > 0 ? (
              <InlineNote tone="danger">
                {t('workflowExecution.blocker.unsatisfiable', {
                  count: blocker.unsatisfiable.length,
                  ids: blocker.unsatisfiable.join(', '),
                })}
                {see(t('workflowExecution.blocker.seeDependencies'), links.dependencies)}
              </InlineNote>
            ) : null}
          </div>
        );
      case 'broken':
        return (
          <InlineNote key={key} tone="danger">
            {t('workflowExecution.blocker.broken')}
          </InlineNote>
        );
      case 'definition-changed':
        return (
          <InlineNote key={key} tone="attention">
            {t('workflowExecution.blocker.definitionChanged', { version: blocker.pinned.version })}
          </InlineNote>
        );
      case 'type-not-allowed':
      case 'definition-missing':
        return (
          <InlineNote key={key} tone="danger">
            {t(
              blocker.kind === 'type-not-allowed'
                ? 'workflowExecution.blocker.typeNotAllowed'
                : 'workflowExecution.blocker.definitionMissing',
            )}
          </InlineNote>
        );
      case 'not-configured':
        return (
          <InlineNote key={key} tone="info">
            {t('workflowExecution.blocker.notConfigured')}
          </InlineNote>
        );
      case 'context-unresolved':
        return (
          <InlineNote key={key} tone="danger">
            <span className="font-medium text-content-primary">
              {t('workflowExecution.blocker.contextUnresolved', { count: blocker.entries.length })}
            </span>
            {see(t('workflowExecution.blocker.seeContext'), links.context)}
          </InlineNote>
        );
      case 'context-awaited':
        return (
          <InlineNote key={key} tone="info" icon="clock">
            {t('workflowExecution.blocker.contextAwaited', { count: blocker.entries.length })}
            {see(t('workflowExecution.blocker.seeContext'), links.context)}
          </InlineNote>
        );
      case 'gates-unsatisfied':
        return (
          <div key={key} className="grid gap-1.5">
            <Typography as="p" variant="body-sm" className="text-content-secondary">
              {t('workflowExecution.blocker.entryGates')}
            </Typography>
            <GateList gates={blocker.gates} label={t('workflowExecution.blocker.entryGates')} />
          </div>
        );
      default:
        return null;
    }
  });
}
