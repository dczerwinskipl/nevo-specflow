import { useEffect, useState, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  DescriptionList,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InlineNote,
  Spinner,
  Typography,
} from '@nevo/ui';
import type { CloseMerge } from '@nevo/specflow-contracts/specs';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { useAppServices } from '../../../../app/useAppServices';
import { documentStateLabel } from '../../../documents';
import { InlineAction } from '../InlineAction';
import {
  specsOverviewKeys,
  type DocumentItem,
  type TaskProgressData,
} from '../../../specs/read-model';
import { progressText, terminalSummary } from '../../overview/progress';
import { taskKeys } from '../../queries';
import { invalidateAfterTaskChange } from '../../authoring/queries';
import { workflowRefusalOf } from '../refusal';
import { focusInitial } from '../focusInitial';
import {
  BlockerGroups,
  ITEMS_SHOWN,
  closeReasons,
  workflowAtOf,
  type BlockerTask,
} from './BlockerGroups';
import {
  DOCUMENT_COMMIT_RECHECK,
  closeDialogOutcome,
  waitsForDocumentCommits,
  type DocumentCommitRecheck,
} from './closeDialogOutcome';
import { RepositoryBlockers } from './RepositoryBlockers';

type Position = WorkflowActionProjection['position'];

/** After this long a check names the slow part (the repository). */
export const SLOW_CHECK_MS = 3000;

export interface CloseSpecificationDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly specId: string;
  readonly specTitle: string;
  readonly projection: WorkflowActionProjection;
  /**
   * Every Task of the Specification by id: the blocker items, and the Tasks fact of a planned Close
   * (the cancelled and abandoned ones are listed as not delivered).
   */
  readonly tasks: ReadonlyMap<string, BlockerTask>;
  /** The Runtime's Task counts (the same as Now's), for the Tasks fact; no row without them. */
  readonly progress?: TaskProgressData;
  /**
   * The Specification's documents with their content state (the workspace read), for the Documents
   * fact: those still only their initial content. Without them the fact is left out.
   */
  readonly documents?: readonly Pick<DocumentItem, 'id' | 'title' | 'filename' | 'contentState'>[];
  readonly onAbandonInstead?: () => void;
  readonly onSeeWorkflow: () => void;
  readonly onSeeTasks: () => void;
  readonly onOpenTask: (taskId: string) => void;
  readonly onClosed: () => void;
  /** How the preview is read again while document commits settle; the default outside tests. */
  readonly documentCommitRecheck?: DocumentCommitRecheck;
}

/**
 * Close: exactly one outcome at a time (`closeDialogOutcome`) under the constant title. While the
 * check runs, only Cancel. Blocked: the workflow blockers with the agent Turns running in the
 * checkout (the occupancy read), or the blockers and repository preconditions a preview or Close
 * refused with, and Check again for the repository ones. Ready: what closing does (Result for an
 * abandoned Specification, Merges, Tasks, Documents) and that it archives for good. A refused or failed check
 * says what to do and checks again on request.
 */
export function CloseSpecificationDialog(props: CloseSpecificationDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open ? <CloseContent {...props} /> : null}
    </Dialog>
  );
}

function CloseContent({
  onOpenChange,
  specId,
  specTitle,
  projection,
  tasks,
  progress,
  documents = [],
  onAbandonInstead,
  onSeeWorkflow,
  onSeeTasks,
  onOpenTask,
  onClosed,
  documentCommitRecheck = DOCUMENT_COMMIT_RECHECK,
}: CloseSpecificationDialogProps) {
  const { t, i18n } = useTranslation();
  // The refusals counted before the last "Check again": the bound applies to each round of checks.
  const [rechecksFrom, setRechecksFrom] = useState(0);
  const { taskApi, workflowExecutionApi } = useAppServices();
  const exit = projection.specification?.exit?.close;
  const workflowBlockers = exit?.kind === 'blocked' ? exit.blockers : undefined;
  const queryClient = useQueryClient();
  // The preview plans the Close: its operation id must stay the one the Close sends, so it is
  // read once per opening (and on "Check again"), outside the Specification caches that a Close
  // refreshes.
  const preview = useQuery({
    queryKey: ['close-preview', specId],
    queryFn: ({ signal }) => workflowExecutionApi.closePreview(specId, signal),
    enabled: workflowBlockers === undefined,
    retry: false,
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Saved documents still queued for their commit settle by themselves: read the preview again
    // until they do (then it plans the Close or names the real blockers). Stops when the dialog
    // closes, since the query unmounts with it.
    refetchInterval: (query) =>
      query.state.status === 'error' &&
      waitsForDocumentCommits(workflowRefusalOf(query.state.error)) &&
      query.state.errorUpdateCount - rechecksFrom < documentCommitRecheck.attempts
        ? documentCommitRecheck.intervalMs
        : false,
  });

  // A Close the workflow blocks is not planned; the running agent Turns that would hold its
  // checkout too are read on their own, so both are listed at once.
  const occupancy = useQuery({
    queryKey: ['close-occupancy', specId],
    queryFn: ({ signal }) => workflowExecutionApi.closeOccupancy(specId, signal),
    enabled: workflowBlockers !== undefined,
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  // The hold reasons of the blocking Tasks, as the Tasks page rows show them (the same read).
  const holdReasons = useQuery({
    queryKey: taskKeys.list(specId, {}),
    queryFn: ({ signal }) => taskApi.getTaskList(specId, {}, signal),
    enabled: workflowBlockers !== undefined,
    select: (list) =>
      new Map(
        list.groups.flatMap((group) =>
          group.tasks.flatMap((task) =>
            'holdReason' in task && task.holdReason !== undefined
              ? [[task.id, task.holdReason] as const]
              : [],
          ),
        ),
      ),
  });
  const blockerTasks = holdReasons.data
    ? new Map(
        [...tasks].map(([id, task]) => {
          const holdReason = holdReasons.data.get(id);

          return [id, holdReason === undefined ? task : { ...task, holdReason }] as const;
        }),
      )
    : tasks;
  const close = useMutation({
    mutationFn: (operationId: string) => workflowExecutionApi.close(specId, operationId),
    // Whatever the answer, the Specification may have changed (closed, archived, partly done).
    onSettled: () =>
      Promise.all([
        invalidateAfterTaskChange(queryClient, specId),
        queryClient.invalidateQueries({ queryKey: specsOverviewKeys.all }),
      ]),
    onSuccess: (result) => {
      if (result.status === 'completed') {
        onClosed();
      }
    },
  });
  const checkAgain = () => {
    setRechecksFrom(preview.errorUpdateCount);
    close.reset();
    void preview.refetch();
  };

  const previewRefusal = preview.isError ? workflowRefusalOf(preview.error) : undefined;
  // "Check again" reads the preview anew: checking until it answers. The automatic re-reads for
  // document commits keep their own checking line.
  const rereading =
    preview.isFetching && !(previewRefusal && waitsForDocumentCommits(previewRefusal));
  const outcome = closeDialogOutcome({
    ...(workflowBlockers ? { workflowBlockers } : {}),
    ...(occupancy.data ? { occupancyBlockers: occupancy.data.blockers } : {}),
    preview: rereading
      ? { status: 'pending' }
      : previewRefusal
        ? {
            status: 'error',
            refusal: previewRefusal,
            documentRechecksExhausted:
              preview.errorUpdateCount - rechecksFrom >= documentCommitRecheck.attempts,
          }
        : preview.data
          ? { status: 'success', merge: preview.data.merge }
          : { status: 'pending' },
    close: close.isError
      ? { status: 'error', refusal: workflowRefusalOf(close.error) }
      : close.isSuccess
        ? { status: 'success', result: close.data }
        : { status: close.isPending ? 'pending' : 'idle' },
  });
  const position: Position = projection.position;
  const abandonment =
    position.kind === 'terminal' && position.abandonment ? position.abandonment : undefined;
  const dismiss = () => onOpenChange(false);
  const go = (action: () => void) => () => {
    dismiss();
    action();
  };

  const title = t('workflowExecution.close.title', { title: specTitle });

  const view = ((): { description?: string; body: ReactNode; footer: ReactNode } => {
    switch (outcome.kind) {
      case 'blocked': {
        const { blockers, repository } = outcome;
        const dismissButton = (
          <Button
            data-initial-focus=""
            variant={repository.length > 0 ? 'secondary' : 'primary'}
            onClick={dismiss}
          >
            {t('workflowExecution.exit.dismiss')}
          </Button>
        );

        return {
          // A refusal names workflow blockers or repository preconditions, never both.
          description:
            repository.length > 0
              ? t('workflowExecution.close.blockedRepository', {
                  title: specTitle,
                  count: repository.length,
                })
              : t('workflowExecution.close.blocked', {
                  title: specTitle,
                  reasons: closeReasons(t, i18n.language, blockers, tasks, workflowAtOf(position)),
                }),
          body: (
            <>
              {blockers.length > 0 ? (
                <BlockerGroups
                  blockers={blockers}
                  order="close"
                  tasks={blockerTasks}
                  workflowAt={workflowAtOf(position)}
                  onOpenTask={(id) => go(() => onOpenTask(id))()}
                  onSeeWorkflow={go(onSeeWorkflow)}
                  onSeeTasks={go(onSeeTasks)}
                />
              ) : null}
              {repository.length > 0 ? (
                <RepositoryBlockers repository={repository} specTitle={specTitle} />
              ) : null}
              {/* Abandoning needs a Close too, which meets the same repository checks. */}
              {onAbandonInstead && blockers.length > 0 ? (
                <Typography as="p" variant="body-sm" className="text-content-secondary">
                  {t('workflowExecution.close.abandonPrompt')}{' '}
                  <InlineAction onClick={onAbandonInstead}>
                    {t('workflowExecution.close.abandonInstead')}
                  </InlineAction>
                </Typography>
              ) : null}
            </>
          ),
          footer:
            repository.length > 0 ? (
              <>
                {dismissButton}
                <Button onClick={checkAgain}>{t('workflowExecution.close.checkAgain')}</Button>
              </>
            ) : (
              dismissButton
            ),
        };
      }

      case 'checking':
        return {
          body: <Checking specTitle={specTitle} documents={outcome.waitingFor === 'documents'} />,
          footer: (
            <Button data-initial-focus="" variant="secondary" onClick={dismiss}>
              {t('common.cancel')}
            </Button>
          ),
        };
      case 'cannot-start':
      case 'not-closed':
        return {
          body: (
            <Alert
              role="alert"
              tone="danger"
              title={
                outcome.kind === 'cannot-start'
                  ? t('workflowExecution.close.checkFailed', { title: specTitle })
                  : t('workflowExecution.close.failed')
              }
            >
              {t(outcome.reasonKey)}
            </Alert>
          ),
          footer: (
            <>
              <Button data-initial-focus="" variant="secondary" onClick={dismiss}>
                {t('workflowExecution.exit.dismiss')}
              </Button>
              <Button onClick={checkAgain}>{t('workflowExecution.close.checkAgain')}</Button>
            </>
          ),
        };
      case 'needs-attention':
        return {
          body: (
            <Alert role="status" tone="attention" title={t('workflowExecution.close.notCompleted')}>
              {t(`workflowExecution.close.status.${outcome.status}`)}
            </Alert>
          ),
          footer: (
            <Button data-initial-focus="" onClick={dismiss}>
              {t('workflowExecution.exit.dismiss')}
            </Button>
          ),
        };
      case 'ready':
      case 'closing': {
        const closing = outcome.kind === 'closing';

        return {
          ...(abandonment
            ? {
                description: t('workflowExecution.close.afterAbandon', {
                  reason: abandonment.reason,
                }),
              }
            : {}),
          body: (
            <>
              {abandonment ? null : (
                <Alert tone="success" title={t('workflowExecution.close.readyTitle')}>
                  {/* With Git off no repository check ran and nothing is merged. */}
                  {outcome.merge.status === 'not-integrated' && outcome.merge.reason === 'git-off'
                    ? t('workflowExecution.close.readyGitOffBody')
                    : position.kind === 'terminal'
                      ? t('workflowExecution.close.readyBody')
                      : t('workflowExecution.close.readyChecksBody')}
                </Alert>
              )}
              <CloseFacts
                merge={outcome.merge}
                position={position}
                tasks={tasks}
                {...(progress ? { progress } : {})}
                documents={documents}
                onSeeTasks={go(onSeeTasks)}
              />
              <InlineNote>{t('workflowExecution.close.archiveNote')}</InlineNote>
            </>
          ),
          footer: (
            <>
              <Button
                data-initial-focus=""
                variant="secondary"
                disabled={closing}
                onClick={dismiss}
              >
                {t('common.cancel')}
              </Button>
              <Button
                aria-busy={closing || undefined}
                disabled={closing}
                onClick={() => preview.data && close.mutate(preview.data.operationId)}
              >
                {closing
                  ? t('workflowExecution.close.submitting')
                  : t('workflowExecution.close.submit')}
              </Button>
            </>
          ),
        };
      }
    }
  })();

  return (
    <DialogContent
      closeLabel={t('common.close')}
      onOpenAutoFocus={focusInitial}
      {...(view.description === undefined ? { 'aria-describedby': undefined } : {})}
      data-close-outcome={outcome.kind}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {view.description !== undefined ? (
          <DialogDescription>{view.description}</DialogDescription>
        ) : null}
      </DialogHeader>
      <DialogBody className="grid min-w-0 gap-5">{view.body}</DialogBody>
      <DialogFooter>{view.footer}</DialogFooter>
    </DialogContent>
  );
}

/**
 * The check in progress: one polite live line, and after {@link SLOW_CHECK_MS} the slow part it
 * waits for. Waiting for document commits names them instead.
 */
function Checking({
  specTitle,
  documents,
}: {
  readonly specTitle: string;
  readonly documents: boolean;
}) {
  const { t } = useTranslation();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_CHECK_MS);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1"
      role="status"
      aria-live="polite"
    >
      <Spinner size="sm" />
      <span className="text-body-md text-content-primary">
        {documents
          ? t('workflowExecution.close.documentsCheckingTitle')
          : t('workflowExecution.close.checking', { title: specTitle })}
      </span>
      {documents || slow ? (
        <Typography as="p" variant="body-sm" className="col-start-2 text-content-secondary">
          {documents
            ? t('workflowExecution.close.documentsCheckingBody')
            : t('workflowExecution.close.checkingSlow')}
        </Typography>
      ) : null}
    </div>
  );
}

const CODE = <span className="font-mono" />;

/** What the Close merges, from the preview's `merge` fact. */
function MergeFact({ merge }: { readonly merge: CloseMerge }) {
  const { t } = useTranslation();
  if (merge.status === 'integrates') {
    return merge.commitsAhead === 0 ? (
      t('workflowExecution.close.merge.nothing')
    ) : (
      <span className="[overflow-wrap:anywhere]">
        <span className="font-mono">{merge.sourceBranch}</span> →{' '}
        <span className="font-mono">{merge.targetBranch}</span>
      </span>
    );
  }

  switch (merge.reason) {
    case 'primary-checkout':
    case 'archive-only':
      return (
        <Trans
          i18nKey={
            merge.reason === 'primary-checkout'
              ? 'workflowExecution.close.merge.primary'
              : 'workflowExecution.close.merge.archiveOnly'
          }
          values={{ branch: merge.sourceBranch }}
          components={{ code: CODE }}
        />
      );
    case 'git-off':
      return merge.checkout === 'linked'
        ? t('workflowExecution.close.merge.gitOffLinked')
        : t('workflowExecution.close.merge.gitOff');
  }
}

/** Documents the Documents fact names before "+N". */
const DOCUMENT_NAMES = 3;

/**
 * The facts of a planned Close, in a fixed order: Result (an abandoned Specification), Merges,
 * Tasks, Documents. Tasks reads the Runtime's counts in Now's words (`terminalSummary`); the Tasks
 * not delivered are only named below them. Documents (only when some apply) names the documents
 * still only their initial content, in the shared document state vocabulary; informative, never a
 * blocker.
 */
function CloseFacts({
  merge,
  position,
  tasks,
  progress,
  documents,
  onSeeTasks,
}: {
  readonly merge: CloseMerge;
  readonly position: Position;
  readonly tasks: ReadonlyMap<string, BlockerTask>;
  readonly progress?: TaskProgressData;
  readonly documents: NonNullable<CloseSpecificationDialogProps['documents']>;
  readonly onSeeTasks: () => void;
}) {
  const { t } = useTranslation();
  // The run has ended or ends with the Close: no relation applies, only the content state.
  const initialOnly = documents
    .filter(
      (document) =>
        documentStateLabel(document.contentState, undefined, { stepOnScreen: false })?.contentOnly,
    )
    .map((document) => document.filename ?? document.title);
  const documentNames = [
    ...initialOnly.slice(0, DOCUMENT_NAMES),
    ...(initialOnly.length > DOCUMENT_NAMES
      ? [t('workflowExecution.close.documentsMore', { count: initialOnly.length - DOCUMENT_NAMES })]
      : []),
  ].join(', ');
  const abandoned = position.kind === 'terminal' && position.outcome === 'abandoned';
  const notDeliveredTasks = [...tasks.values()].filter(
    (task) => task.statusId === 'cancelled' || task.statusId === 'abandoned',
  );
  const notDelivered = notDeliveredTasks.length;
  const tasksFact = progress
    ? ((position.kind === 'terminal'
        ? terminalSummary(progress, position.outcome, t)
        : progressText(progress, t)) ?? t('workflowExecution.close.tasksFact.none'))
    : undefined;

  return (
    <>
      <DescriptionList>
        {abandoned ? (
          <DescriptionList.Item>
            <DescriptionList.Term>{t('workflowExecution.close.facts.result')}</DescriptionList.Term>
            <DescriptionList.Detail>
              {t('workflowExecution.close.facts.notDelivered')}
            </DescriptionList.Detail>
          </DescriptionList.Item>
        ) : null}
        <DescriptionList.Item>
          <DescriptionList.Term>{t('workflowExecution.close.facts.merges')}</DescriptionList.Term>
          <DescriptionList.Detail>
            <MergeFact merge={merge} />
          </DescriptionList.Detail>
        </DescriptionList.Item>
        {tasksFact !== undefined ? (
          <DescriptionList.Item>
            <DescriptionList.Term>{t('workflowExecution.close.facts.tasks')}</DescriptionList.Term>
            <DescriptionList.Detail>{tasksFact}</DescriptionList.Detail>
          </DescriptionList.Item>
        ) : null}
        {initialOnly.length > 0 ? (
          <DescriptionList.Item>
            <DescriptionList.Term>
              {t('workflowExecution.close.facts.documents')}
            </DescriptionList.Term>
            <DescriptionList.Detail>
              {t('workflowExecution.close.documentsFact', {
                count: initialOnly.length,
                names: documentNames,
              })}
            </DescriptionList.Detail>
          </DescriptionList.Item>
        ) : null}
      </DescriptionList>
      {notDelivered > 0 ? (
        <section className="grid gap-2" aria-label={t('workflowExecution.close.notDelivered')}>
          <div className="grid gap-0.5">
            <Typography as="h3" variant="label-sm">
              {t('workflowExecution.close.notDelivered')}
            </Typography>
            <Typography as="p" variant="body-sm" className="text-content-secondary">
              {t('workflowExecution.close.notDeliveredExplanation')}
            </Typography>
          </div>
          <ul className="grid gap-1 text-body-sm">
            {notDeliveredTasks.slice(0, ITEMS_SHOWN).map((task) => (
              <li key={task.id} className="min-w-0 [overflow-wrap:anywhere]">
                <span className="font-mono text-content-muted">{task.id}</span> {task.title}
              </li>
            ))}
            {notDelivered > ITEMS_SHOWN ? (
              <li>
                <InlineAction onClick={onSeeTasks}>
                  {t('workflowExecution.exit.more', { count: notDelivered - ITEMS_SHOWN })}
                </InlineAction>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </>
  );
}
