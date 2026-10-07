import { useState } from 'react';
import { Button, cn, Icon, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { SpecificationWorkspaceData } from './model';
import { TaskRow } from './TaskRow';

export interface WorkViewProps {
  readonly data: SpecificationWorkspaceData;
  readonly selectedTasks: ReadonlySet<string>;
  readonly onSelectTask: (taskId: string, selected: boolean) => void;
  readonly onPreviewTask: (taskId: string) => void;
  readonly onOpenSession: (sessionId: string) => void;
  readonly onOpenSessionsView: () => void;
  readonly onOpenDoc: (docId: string) => void;
  readonly onOpenDocumentsView: () => void;
  readonly onOpenChanges: (source: 'base' | 'uncommitted' | 'mr') => void;
  readonly onOpenRepository: () => void;
  readonly onOpenHistory: () => void;
  readonly onNewConversation: () => void;
  readonly onExecuteSelected: () => void;
  readonly fullTaskHref: (taskId: string) => string;
}

export function WorkView({
  data,
  selectedTasks,
  onSelectTask,
  onPreviewTask,
  onOpenSession,
  onOpenSessionsView,
  onOpenDoc,
  onOpenDocumentsView,
  onOpenChanges,
  onOpenRepository,
  onOpenHistory,
  onNewConversation,
  onExecuteSelected,
  fullTaskHref,
}: WorkViewProps) {
  const { t } = useTranslation();
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set());

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const completedCount = data.taskGroups
    .flatMap((g) => g.tasks)
    .filter(
      (task) =>
        task.status.toLowerCase().includes('ukończon') ||
        task.status.toLowerCase().includes('done'),
    ).length;
  const totalTasks = data.taskGroups.flatMap((g) => g.tasks).length;

  return (
    <div className="grid max-w-content-standard gap-8 py-2">
      {/* 1. Header & Title in body */}
      <div>
        <Typography as="h1" variant="title-md" className="font-semibold text-content-primary">
          {data.title}
        </Typography>
        {!data.isEmpty ? (
          <div className="mt-2 grid gap-2">
            <Typography variant="body-md" className="text-content-secondary">
              {data.intro}
            </Typography>
            <button
              type="button"
              onClick={() => onOpenDoc('spec')}
              className="w-fit text-left text-body-sm font-medium text-accent-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring"
            >
              {t('specification.readSpecificationLink')}
            </button>
          </div>
        ) : null}
      </div>

      {/* 2. Attention Section */}
      {data.attentionItems.length > 0 ? (
        <section
          aria-labelledby="attention-heading"
          className="rounded-control border-l-2 border-status-warning bg-surface-subtle p-4"
        >
          <div className="flex items-center gap-2 text-status-warning">
            <Icon name="triangle-alert" size="sm" />
            <Typography
              as="h2"
              variant="title-sm"
              id="attention-heading"
              className="font-semibold text-content-primary"
            >
              {t('specification.requiresAttention')}{' '}
              <span className="text-body-xs font-normal text-content-muted">
                {data.attentionItems.length}
              </span>
            </Typography>
          </div>

          <div className="mt-3 divide-y divide-border-subtle">
            {data.attentionItems.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-2 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className="mt-0.5 shrink-0 text-content-secondary">
                    {item.kind === 'task' ? (
                      <Icon name="list-checks" size="sm" />
                    ) : item.kind === 'session' ? (
                      <Icon name="chat" size="sm" />
                    ) : (
                      <Icon name="branch" size="sm" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium text-content-primary [overflow-wrap:anywhere]">
                      {item.title}
                    </div>
                    <div className="text-body-xs text-content-muted">{item.reason}</div>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  className="self-start sm:self-center shrink-0"
                  onClick={() => {
                    if (item.kind === 'task' && item.targetId) {
                      onPreviewTask(item.targetId);
                    } else if (item.kind === 'session' && item.targetId) {
                      onOpenSession(item.targetId);
                    } else if (item.kind === 'git') {
                      onOpenRepository();
                    }
                  }}
                >
                  {item.actionLabel}
                </Button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* 3. Repo Context Section */}
      {data.hasGit && data.repoContext ? (
        <section aria-labelledby="repo-heading" className="grid gap-2">
          <div className="flex items-center gap-2">
            <Icon name="branch" size="sm" className="text-content-muted" />
            <Typography
              as="h2"
              variant="title-sm"
              id="repo-heading"
              className="font-semibold text-content-primary"
            >
              {t('specification.repositoryHeading')}
            </Typography>
          </div>

          <div className="flex flex-wrap items-baseline gap-3 text-body-sm">
            <span className="font-medium text-content-primary">{data.repoContext.branch}</span>
            <span className="text-content-muted">
              {t('specification.baseBranchLabel', { base: data.repoContext.baseBranch })}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-xs text-content-secondary">
            <span className={cn(data.repoContext.isDirty && 'text-status-warning')}>
              {data.repoContext.freshness === 'unknown'
                ? t('specification.gitLocalChangesUnknown')
                : t('specification.uncommittedFilesCount', {
                    count: data.repoContext.uncommittedCount,
                  })}
            </span>
            <span aria-hidden="true" className="text-content-muted">
              ·
            </span>
            <span>
              {data.repoContext.freshness === 'unknown'
                ? t('specification.gitSyncUnknown')
                : data.repoContext.syncStatus}
            </span>
            <span aria-hidden="true" className="text-content-muted">
              ·
            </span>
            <span>
              {data.repoContext.freshness === 'unknown'
                ? t('specification.gitConflictsUnknown')
                : data.repoContext.conflictStatus}
            </span>
          </div>

          {data.repoContext.linkedPr ? (
            <div className="mt-1 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-2 text-body-sm">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-body-xs text-content-muted">
                  PR #{data.repoContext.linkedPr.number}
                </span>
                <span className="font-medium text-content-primary">
                  {data.repoContext.linkedPr.title}
                </span>
              </div>

              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => onOpenChanges('mr')}
                  className="text-body-xs font-medium text-accent-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring"
                >
                  {t('specification.prReviewLink')}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenChanges('base')}
                  className="text-body-xs font-medium text-accent-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring"
                >
                  {t('specification.changesLink')}
                </button>
              </div>
            </div>
          ) : null}

          {data.repoContext.freshness !== 'fresh' ? (
            <div className="mt-1 flex items-center gap-3 text-body-xs text-content-muted">
              <span>
                {data.repoContext.freshness === 'unknown'
                  ? t('specification.gitRefreshFailed')
                  : t('specification.gitStaleData')}
              </span>
              <button
                type="button"
                className="font-medium text-accent-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring"
              >
                {t('common.retry')}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* 4. Resume Session Section */}
      {!data.isEmpty && data.resumeSession ? (
        <section aria-labelledby="resume-heading" className="grid gap-2">
          <div className="flex items-center gap-2">
            <Icon name="chat" size="sm" className="text-content-muted" />
            <Typography
              as="h2"
              variant="title-sm"
              id="resume-heading"
              className="font-semibold text-content-primary"
            >
              {t('specification.continueSessionHeading')}
            </Typography>
          </div>

          <button
            type="button"
            onClick={() => onOpenSession(data.resumeSession!.id)}
            className="flex w-full items-center justify-between gap-4 rounded-control border border-border-subtle bg-surface-subtle p-3 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring"
            aria-label={t('specification.openSessionNamed', { title: data.resumeSession.title })}
          >
            <div className="min-w-0">
              <div className="font-medium text-content-primary [overflow-wrap:anywhere]">
                {data.resumeSession.title}
              </div>
              <div className="mt-0.5 text-body-xs text-content-muted">
                {data.resumeSession.meta}
              </div>
            </div>
            <span className="shrink-0 text-body-sm font-medium text-accent-primary">
              {t('specification.openSessionAction')}
            </span>
          </button>

          <div className="mt-1 flex flex-wrap items-center gap-4 text-body-xs">
            <button
              type="button"
              onClick={onOpenSessionsView}
              className="font-medium text-accent-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring"
            >
              {t('specification.allSessionsLink')}
            </button>
            <button
              type="button"
              onClick={onNewConversation}
              className="font-medium text-accent-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring"
            >
              {t('specification.newConversation')}
            </button>
            <button
              type="button"
              onClick={onOpenHistory}
              className="font-medium text-accent-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring lg:hidden"
            >
              {t('specification.activityHistoryLink')}
            </button>
          </div>
        </section>
      ) : null}

      {/* 5. Empty / Preparation Banner */}
      {data.isEmpty ? (
        <section
          aria-labelledby="preparation-heading"
          className="rounded-control border-l-2 border-primary bg-primary/5 p-4"
        >
          <div className="flex items-center gap-2 text-accent-primary">
            <Icon name="chat" size="sm" />
            <Typography
              as="h2"
              variant="title-sm"
              id="preparation-heading"
              className="font-semibold text-content-primary"
            >
              {t('specification.prepareSpecificationHeading')}
            </Typography>
          </div>
          <Typography variant="body-sm" className="mt-2 text-content-secondary">
            {t('specification.prepareSpecificationDescription')}
          </Typography>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <Button leadingIcon="chat" onClick={onNewConversation}>
              {t('specification.startConversation')}
            </Button>
            <button
              type="button"
              onClick={onOpenHistory}
              className="text-body-xs font-medium text-accent-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring lg:hidden"
            >
              {t('specification.activityHistoryLink')}
            </button>
          </div>
        </section>
      ) : null}

      {/* 6. Tasks Section */}
      {!data.isEmpty ? (
        <section aria-labelledby="tasks-heading" className="border-t border-border-subtle pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Icon name="list-checks" size="sm" className="text-content-muted" />
              <Typography
                as="h2"
                variant="title-sm"
                id="tasks-heading"
                className="font-semibold text-content-primary"
              >
                {t('specification.tasksHeading')}{' '}
                <span className="text-body-xs font-normal text-content-muted">
                  {data.isPreparing
                    ? t('specification.tasksInPreparation', { count: totalTasks })
                    : t('specification.tasksProgressCount', {
                        completed: completedCount,
                        total: totalTasks,
                      })}
                </span>
              </Typography>
            </div>

            <div className="flex items-center gap-3">
              <span className="min-w-20 text-body-xs text-content-muted text-right">
                {selectedTasks.size > 0
                  ? t('specification.selectedTasksCount', { count: selectedTasks.size })
                  : ''}
              </span>
              <div className="w-40 flex justify-end">
                {selectedTasks.size > 0 ? (
                  <Button size="sm" onClick={onExecuteSelected}>
                    {t('specification.executeWithAgent')}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          {data.isPreparing ? (
            <Typography variant="body-sm" className="mt-2 text-content-secondary">
              {t('specification.tasksPreparingNotice')}
            </Typography>
          ) : null}

          <div className="mt-4 grid gap-4">
            {data.taskGroups.map((group) => {
              const isCollapsed = collapsedGroups.has(group.id);

              return (
                <div key={group.id} className="grid">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className="flex w-full items-center gap-2 py-2 text-left text-body-xs font-medium text-content-secondary hover:text-content-primary focus-visible:outline-2 focus-visible:outline-focus-ring"
                    aria-expanded={!isCollapsed}
                  >
                    <Icon
                      name={isCollapsed ? 'chevron-right' : 'chevron-down'}
                      size="sm"
                      className="text-content-muted"
                    />
                    <span>{group.name}</span>
                    <span className="text-content-muted font-normal">{group.tasks.length}</span>
                  </button>

                  {!isCollapsed ? (
                    <div>
                      {group.tasks.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          selected={selectedTasks.has(task.id)}
                          isPreparing={data.isPreparing}
                          onSelect={onSelectTask}
                          onPreview={onPreviewTask}
                          fullTaskHref={fullTaskHref(task.id)}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* 7. Documents Summary Section */}
      {!data.isEmpty ? (
        <section
          aria-labelledby="documents-summary-heading"
          className="border-t border-border-subtle pt-6"
        >
          <div className="flex items-center gap-2">
            <Icon name="file" size="sm" className="text-content-muted" />
            <Typography
              as="h2"
              variant="title-sm"
              id="documents-summary-heading"
              className="font-semibold text-content-primary"
            >
              {t('specification.documentsHeading')}{' '}
              <span className="text-body-xs font-normal text-content-muted">
                {data.documents.length}
              </span>
            </Typography>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-4 text-body-xs">
            {data.documents.slice(1, 3).map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => onOpenDoc(doc.id)}
                className="font-medium text-accent-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring"
              >
                {doc.title}
              </button>
            ))}
            <button
              type="button"
              onClick={onOpenDocumentsView}
              className="font-medium text-accent-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring"
            >
              {t('specification.allDocumentsLink')}
            </button>
          </div>
        </section>
      ) : null}

      {/* 8. Extensions Section (if applicable) */}
      {data.hasExtensions ? (
        <section
          aria-labelledby="operations-heading"
          className="border-t border-border-subtle pt-6"
        >
          <div className="flex items-center gap-2">
            <Icon name="workflow" size="sm" className="text-content-muted" />
            <Typography
              as="h2"
              variant="title-sm"
              id="operations-heading"
              className="font-semibold text-content-primary"
            >
              {t('specification.relatedOperationsHeading')}
            </Typography>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-control border border-border-subtle bg-surface-subtle p-3">
            <div>
              <div className="font-medium text-content-primary">
                {t('specification.continuousIntegration')}
              </div>
              <div className="text-body-xs text-content-muted">
                {t('specification.lastCheckPassed')}
              </div>
            </div>
            <Button size="sm" variant="secondary">
              {t('common.open')}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
