import { useTranslation } from 'react-i18next';
import { InformationList, StatusIndicator, Typography } from '@nevo/ui';
import { ContextKey, ContextNavigationRow } from './ContextNavigationRow';
import {
  ContextNote,
  ContextSection,
  ContextSkeletonRows,
  type ContextSkeletonShape,
} from './ContextSectionFrame';
import { isRequired, isSectionPresent, resolveSection } from './sessionContextAvailability';
import type {
  SessionContextExecutionScope,
  SessionContextTaskRef,
  SessionContextViewModel,
} from './sessionContextTypes';

/** Task-scoped sessions show up to this many placeholder rows while the execution loads. */
const maxExecutionSkeletonRows = 3;

/**
 * "Current execution": what the Session is executing. Present for Specification- and Task-scoped
 * Sessions; the Tasks are required only for Task scope, where an unfindable Task is an error note
 * (Tasks that were found still render beside it, see `missingTaskCount`).
 */
export function ContextExecutionSection({
  value,
  onOpenTask,
}: {
  value: SessionContextViewModel;
  onOpenTask: (task: SessionContextTaskRef) => void;
}) {
  const { t } = useTranslation();
  if (!isSectionPresent('executionScope', value.scope)) {
    return null;
  }

  const resolved = resolveSection(value.executionScope, isRequired('executionScope', value.scope));
  if (resolved.kind === 'omit') {
    return null;
  }

  const skeletonRows: ContextSkeletonShape[] =
    value.scope.kind === 'task'
      ? Array.from(
          { length: Math.min(Math.max(value.scope.taskCount, 1), maxExecutionSkeletonRows) },
          () => 'identity' as const,
        )
      : ['navigation'];

  return (
    <ContextSection
      title={t('sessions.context.executionScope')}
      busy={resolved.kind === 'skeleton'}
    >
      {resolved.kind === 'skeleton' && <ContextSkeletonRows rows={skeletonRows} />}
      {resolved.kind === 'ready' && (
        <ExecutionScope scope={resolved.value} onOpenTask={onOpenTask} />
      )}
      {resolved.kind === 'warning' && (
        <ContextNote kind="warning">
          {t('sessions.context.availability.executionUnreadable')}
        </ContextNote>
      )}
      {resolved.kind === 'error' && (
        <ContextNote kind="error">
          {resolved.ref?.key
            ? t('sessions.context.availability.taskMissingNamed', { key: resolved.ref.key })
            : t('sessions.context.availability.taskMissing')}
        </ContextNote>
      )}
    </ContextSection>
  );
}

/** "Attention / next actions": read-only orientation items and links to a Task's own decision
 * surface. Optional (never required); an empty list is omitted, an unreadable one warns. */
export function ContextAttentionSection({
  value,
  onOpenTask,
}: {
  value: SessionContextViewModel;
  onOpenTask: (task: SessionContextTaskRef) => void;
}) {
  const { t } = useTranslation();
  if (!isSectionPresent('attention', value.scope)) {
    return null;
  }

  const resolved = resolveSection(value.attention, isRequired('attention', value.scope));
  if (resolved.kind === 'omit') {
    return null;
  }

  return (
    <ContextSection title={t('sessions.context.attention')} busy={resolved.kind === 'skeleton'}>
      {resolved.kind === 'skeleton' && <ContextSkeletonRows rows={['navigation']} />}
      {resolved.kind === 'ready' && (
        // Same row grid as every other Context row: the tone dot takes the icon track, so the
        // summary starts on the same text edge as the navigation labels.
        <InformationList>
          {resolved.value.map((item) => (
            <ContextNavigationRow
              key={item.id}
              leading={
                <StatusIndicator
                  tone={item.tone}
                  decorative={false}
                  aria-label={t(`sessions.context.attentionTone.${item.tone}`)}
                />
              }
              label={item.summary}
              onClick={item.task && !item.readOnly ? () => onOpenTask(item.task!) : undefined}
            />
          ))}
        </InformationList>
      )}
      {(resolved.kind === 'warning' || resolved.kind === 'error') && (
        <ContextNote kind="warning">
          {t('sessions.context.availability.attentionUnreadable')}
        </ContextNote>
      )}
    </ContextSection>
  );
}

/** "Related Tasks": one navigational summary row, not the Task list inline (Context is an entry
 * point into its subjects). Optional; an empty list is omitted, an unreadable/missing one warns. */
export function ContextRelatedTasksSection({
  value,
  onOpen,
}: {
  value: SessionContextViewModel;
  onOpen: (tasks: SessionContextTaskRef[]) => void;
}) {
  const { t } = useTranslation();
  if (!isSectionPresent('relatedTasks', value.scope)) {
    return null;
  }

  const resolved = resolveSection(value.relatedTasks, isRequired('relatedTasks', value.scope));
  if (resolved.kind === 'omit') {
    return null;
  }

  return (
    <ContextSection title={t('sessions.context.relatedTasks')} busy={resolved.kind === 'skeleton'}>
      {resolved.kind === 'skeleton' && <ContextSkeletonRows rows={['navigation']} />}
      {resolved.kind === 'ready' && (
        <InformationList>
          <ContextNavigationRow
            icon="list-checks"
            label={t('sessions.context.batch', { count: resolved.value.length })}
            onClick={() => onOpen(resolved.value)}
          />
        </InformationList>
      )}
      {(resolved.kind === 'warning' || resolved.kind === 'error') && (
        <ContextNote kind="warning">
          {t('sessions.context.availability.relatedTasksUnreadable')}
        </ContextNote>
      )}
    </ContextSection>
  );
}

function ExecutionScope({
  scope,
  onOpenTask,
}: {
  scope: SessionContextExecutionScope;
  onOpenTask: (task: SessionContextTaskRef) => void;
}) {
  const { t } = useTranslation();

  if (scope.kind === 'generic') {
    return (
      <Typography variant="body-sm" className="text-content-secondary">
        {t('sessions.context.generic')}
      </Typography>
    );
  }

  if (scope.kind === 'single-task') {
    return (
      <div className="grid gap-1">
        {scope.role && <Typography variant="title-sm">{scope.role}</Typography>}
        <InformationList>
          <TaskLink task={scope.task} onOpen={onOpenTask} />
        </InformationList>
      </div>
    );
  }

  const missing = scope.missingTaskCount ?? 0;
  const total = scope.tasks.length + missing;

  return (
    <div className="grid gap-1">
      {scope.role && <Typography variant="title-sm">{scope.role}</Typography>}
      <Typography variant="body-sm" className="text-content-secondary">
        {t('sessions.context.batch', { count: total })}
      </Typography>
      {missing > 0 && (
        <ContextNote kind="error">
          {t('sessions.context.availability.tasksMissingBatch', { count: missing, total })}
        </ContextNote>
      )}
      <InformationList>
        {scope.tasks.map((task) => (
          <TaskLink key={task.id} task={task} onOpen={onOpenTask} />
        ))}
      </InformationList>
    </div>
  );
}

/** A Task reference row (current-execution Task): the shared `ContextNavigationRow` geometry
 * (icon, title + key, centred chevron) every Context row uses, so it visibly affords "this leads
 * further" like every other operational list row. */
function TaskLink({
  task,
  onOpen,
}: {
  task: SessionContextTaskRef;
  onOpen: (task: SessionContextTaskRef) => void;
}) {
  return (
    <ContextNavigationRow
      icon="list-checks"
      emphasis="identity"
      label={task.title}
      secondary={
        <>
          <ContextKey>{task.key}</ContextKey>
          {task.note && <span className="block text-content-secondary">{task.note}</span>}
        </>
      }
      onClick={() => onOpen(task)}
    />
  );
}
