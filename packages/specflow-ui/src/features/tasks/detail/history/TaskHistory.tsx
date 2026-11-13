import { LoadingPresentation } from '../../../../app/loading/LoadingPresentation';
import { useLayoutEffect, useRef, useId } from 'react';
import { TaskHistoryDetails } from './TaskHistoryDetails';
import { useTaskViewState } from '../TaskViewState';
import { descriptionScrollOwner, restoreScrollPosition } from '../../../documents';

import type { TaskHistoryResourceParams } from './TaskHistoryResourceInspection';
import { Button, Icon, Timeline, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { TaskSnapshot } from '@nevo/specflow-contracts/specs/workspace';
import { TaskSourceState } from '../TaskDetails';
import { useTaskHistory } from '../useTaskPages';
import { formatWhen } from '../../execution/presentation';

export function TaskHistory({
  specId,
  taskId,
  snapshot,
  onOpenResource,
}: {
  readonly specId: string;
  readonly taskId: string;
  readonly snapshot?: TaskSnapshot;
  readonly onOpenResource?: (params: TaskHistoryResourceParams) => void;
}) {
  const { t, i18n } = useTranslation();
  // Who actually worked on an attempt: a person by the recorded id (its identity-source prefix
  // dropped), an agent by its class; a wait step has no actor.
  const actorOf = (
    actor: { readonly class: 'agent' | 'human'; readonly actorId?: string } | null,
  ) =>
    actor
      ? actor.class === 'human' && actor.actorId
        ? actor.actorId.replace(/^(local|user):/, '')
        : t(`taskDetails.executor.${actor.class}`)
      : undefined;
  const titleOf = (step: {
    readonly id: string;
    readonly expectedWork?: { readonly summary?: string } | null;
  }) => step.expectedWork?.summary ?? step.id;
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const { state, update, saveHistoryScroll } = useTaskViewState(taskId);
  const initialScroll = useRef(state.historyScroll ?? 0);
  const prepared = useRef(false);
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) {
      return;
    }

    const stopRestoring = restoreScrollPosition(node, () => initialScroll.current);

    return () => {
      stopRestoring();
      if (!prepared.current) {
        saveHistoryScroll(descriptionScrollOwner(node).scrollTop);
      }
    };
  }, [saveHistoryScroll]);
  const rememberScroll = () => {
    if (root.current) {
      prepared.current = true;
      saveHistoryScroll(descriptionScrollOwner(root.current).scrollTop);
    }
  };

  const query = useTaskHistory(specId, taskId, snapshot);
  const section = snapshot?.sections.history;
  if (query.accessDenied) {
    return <TaskSourceState state="forbidden" />;
  }

  if (section?.state !== 'available' || !query.readerAvailable) {
    return <TaskSourceState state={section?.state === 'forbidden' ? 'forbidden' : 'unavailable'} />;
  }

  const entries =
    query.data?.pages.flatMap((page) =>
      page.items.map((entry) => ({ entry, token: page.token })),
    ) ?? [];

  return (
    <div ref={root} className="grid min-w-0 gap-3 p-4">
      {query.isPending && !query.isError ? (
        <LoadingPresentation
          shape="history"
          label={t('loading.history')}
          fetching={query.fetchStatus === 'fetching'}
        />
      ) : null}
      <Timeline size="md">
        {entries.map(({ entry, token }) => (
          <Timeline.Item key={entry.id}>
            <Timeline.Marker tone="neutral" />
            <Timeline.Content
              title={
                <span role="heading" aria-level={3}>
                  {titleOf(entry.step)}
                  {/* The separating space stays outside the nested span, or the accessible name
                      loses it ("implementation→ Verify"). */}
                  {entry.transitionedTo ? ' ' : null}
                  {entry.transitionedTo ? (
                    <span className="font-normal text-content-secondary">
                      {'→ '}
                      {entry.transitionedTo.kind === 'step'
                        ? titleOf(entry.transitionedTo.step)
                        : t(`taskDetails.outcome.${entry.transitionedTo.outcome}`)}
                    </span>
                  ) : null}
                </span>
              }
            >
              <div className="grid min-w-0 gap-1 [overflow-wrap:anywhere]">
                {/* The result with a neutral icon: results carry no tone of their own. */}
                <Typography as="p" variant="body-sm" className="text-content-primary">
                  {entry.completedAt ? (
                    entry.result ? (
                      <>
                        <span className="mr-1 inline-flex h-[1lh] items-center align-top">
                          <Icon name="arrow-right" size="sm" aria-hidden="true" />
                        </span>
                        {entry.result}
                      </>
                    ) : null
                  ) : (
                    <span className="text-status-info">{t('taskDetails.historyInProgress')}</span>
                  )}
                </Typography>
                {entry.feedback ? (
                  <Typography as="p" variant="body-sm" className="whitespace-pre-line">
                    {entry.feedback}
                  </Typography>
                ) : null}
                <Typography as="p" variant="body-sm" className="text-content-muted">
                  {[
                    (entry.completedAt ?? entry.startedAt)
                      ? formatWhen(t, entry.completedAt ?? entry.startedAt ?? '', i18n.language)
                      : undefined,
                    actorOf(entry.actor),
                    t('taskDetails.attempt', { count: entry.key.attempt }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Typography>
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-self-start"
                  aria-expanded={!!state.historyExpanded?.[entry.id]}
                  aria-controls={`${id}-${entry.id}`}
                  onClick={(event) => {
                    const expanded = { ...state.historyExpanded };
                    if (expanded[entry.id]) {
                      delete expanded[entry.id];
                    } else {
                      expanded[entry.id] = `${snapshot?.revision}:${token}`;
                    }

                    update({ historyExpanded: expanded });
                    event.currentTarget.focus({ preventScroll: true });
                  }}
                >
                  {t(
                    state.historyExpanded?.[entry.id]
                      ? 'taskDetails.hideAttemptDetails'
                      : 'taskDetails.attemptDetails',
                  )}
                </Button>
                {state.historyExpanded?.[entry.id] ? (
                  <div id={`${id}-${entry.id}`} className="grid min-w-0 gap-3">
                    {state.historyExpanded[entry.id] !== `${snapshot?.revision}:${token}` ? (
                      <Typography as="p" variant="body-sm" role="status">
                        {t('taskDetails.contextChanged')}
                      </Typography>
                    ) : (
                      <TaskHistoryDetails
                        entry={entry}
                        token={token}
                        revision={snapshot!.revision}
                        taskId={taskId}
                        onOpenResource={
                          onOpenResource
                            ? (params) => {
                                rememberScroll();
                                onOpenResource(params);
                              }
                            : undefined
                        }
                      />
                    )}
                  </div>
                ) : null}
              </div>
            </Timeline.Content>
          </Timeline.Item>
        ))}
      </Timeline>
      {query.data?.pages.some((page) => page.coverage === 'partial') ? (
        <Typography as="p" variant="body-sm">
          {t('taskDetails.partialHistory')}
        </Typography>
      ) : null}
      {query.isError ? (
        <>
          <Typography as="p" variant="body-sm" role="status">
            {t('taskDetails.pageFailed')}
          </Typography>
          <Button variant="secondary" size="sm" onClick={() => void query.retryPage()}>
            {t('common.retry')}
          </Button>
        </>
      ) : query.hasNextPage ? (
        <Button
          variant="secondary"
          size="sm"
          disabled={query.isFetching}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetching ? t('common.loading') : t('taskDetails.showMore')}
        </Button>
      ) : null}
    </div>
  );
}
