import type { ComponentProps, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AccentBlock, Icon, InlineNote, Progress, Typography, cn } from '@nevo/ui';
import type { GateStatus, WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { GateList, type GateAction } from './GateList';
import { InlineAction } from './InlineAction';
import { closableInFinishDialog } from './FinishTasksOpen';
import {
  actorLabel,
  attemptLine,
  doneWhen,
  formatWhen,
  openTasksText,
  stepTrack,
  transitionLabel,
  type DoneWhen,
  type StepTrack,
} from './presentation';
import { StartBlockerLines, type NowLinks } from './StartBlockerLines';
import { useViewer } from './useViewer';

/** An icon inside running text: on the text line, no flex box that would shift the line. */
function InlineIcon({ name }: { name: ComponentProps<typeof Icon>['name'] }) {
  return (
    <span className="mr-1 inline-flex h-[1lh] items-center align-top">
      <Icon name={name} size="sm" aria-hidden="true" />
    </span>
  );
}

/**
 * Where the step sits among the workflow's steps: the DS Progress position track, then its label.
 * The track carries the accessible name; the visible label is not read twice. Below a 40rem page
 * the label goes under the track. On a wait step the track is compact: the Task progress dominates.
 */
function StepTrackRow({ track, compact }: { track: StepTrack; compact: boolean }) {
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 @max-[40rem]/app-content:flex-col @max-[40rem]/app-content:items-start"
      data-now-track=""
    >
      <Progress
        variant="segmented"
        position={track.position}
        total={track.total}
        size={compact ? 'compact' : 'default'}
        aria-label={track.ariaLabel}
      />
      <Typography
        as="p"
        variant="body-sm"
        aria-hidden="true"
        className="min-w-0 text-content-secondary [overflow-wrap:anywhere]"
      >
        {track.label}
      </Typography>
    </div>
  );
}

/**
 * What finishes the active step: its exit gates as an open checklist (neutral: the step is being
 * worked on; the main action is the fix) and, for a Task, the step the work goes to next.
 */
function DoneWhenList({
  done,
  gateActionFor,
  gateDocument,
}: {
  done: DoneWhen;
  gateActionFor?: (gate: GateStatus) => GateAction | undefined;
  gateDocument?: (gate: GateStatus) => string | undefined;
}) {
  const { t } = useTranslation();
  const heading = (result?: string) =>
    result
      ? t('workflowExecution.now.doneWhenWith', { result })
      : t('workflowExecution.now.doneWhen');
  // Without gates there is no "Done when" at all (never an empty heading); only "Then".
  const then = done.then ? (
    <p className="flex min-w-0 items-start gap-2 text-body-sm text-content-secondary">
      <span className="flex h-[1lh] shrink-0 items-center">
        <Icon name="arrow-right" size="sm" aria-hidden="true" className="text-content-muted" />
      </span>
      <span className="min-w-0 [overflow-wrap:anywhere]">
        {t('workflowExecution.now.then', { step: done.then })}
      </span>
    </p>
  ) : null;

  if (done.groups.length === 0) {
    return <div data-now-then="">{then}</div>;
  }

  return (
    <div className="grid gap-3" data-now-done-when="">
      {done.groups.map((group, index) => (
        <div key={group.result ?? index} className="grid gap-1.5">
          <Typography as="p" variant="label-sm" className="text-content-secondary">
            {heading(group.result)}
          </Typography>
          <GateList
            variant="checklist"
            gates={group.gates}
            label={heading(group.result)}
            actionFor={gateActionFor}
            {...(gateDocument ? { documentFor: gateDocument } : {})}
          />
          {index === done.groups.length - 1 ? then : null}
        </div>
      ))}
    </div>
  );
}

/** A step by its title; its id is detail (tooltip). */
function StepTitle({ step }: { step: { readonly id: string; readonly title: string } }) {
  return <span title={step.id}>{step.title || step.id}</span>;
}

export interface NowBlockProps {
  readonly projection: WorkflowActionProjection;
  readonly headingId: string;
  /** The subject's own status when it changes what can happen now (draft, on hold, abandoned). */
  readonly status?: ReactNode;
  readonly links: NowLinks;
  readonly gateActionFor?: (gate: GateStatus) => GateAction | undefined;
  /** The file name of a gate's document (`findings.md`), when the page knows it. */
  readonly gateDocument?: (gate: GateStatus) => string | undefined;
  /** A transient line just above the actions (a kept finish draft, a post-action notice). */
  readonly note?: ReactNode;
  /**
   * The action row. It is the single attachment point of a later executor choice (Do it myself /
   * Ask agent) on the start action; nothing else in the block changes for it.
   */
  readonly actions?: ReactNode;
  /** The block's ⋯ menu beside its heading (other workflow operations, the step id and revision). */
  readonly menu?: ReactNode;
  /** Show the latest hand-off (default); the Specification Overview leaves it to the history. */
  readonly showHandoff?: boolean;
  /** Replaces the default waiting lines (the Overview's progress and its explanation). */
  readonly waitingContent?: ReactNode;
  /** A line under the position's title (an abandonment's reason). */
  readonly titleNote?: ReactNode;
  /** A summary under the position (the step's purpose or Goal, a terminal Specification's Tasks). */
  readonly summary?: ReactNode;
  /** A start was sent and its new position is not read yet: say so instead of "Ready to start". */
  readonly starting?: boolean;
  /**
   * The subject is on hold: the block says so first ("On hold", then the reason) and where the
   * workflow stands becomes the quiet line under it ("Not started · First step · Implement").
   */
  readonly hold?: { readonly reason?: string };
  /**
   * Replaces the quiet position line (Ask agent mock proposal): an agent attempt's line with its
   * Session link, a stop that waits for proof, an attempt that ended without a finish.
   */
  readonly positionLine?: ReactNode;
}

/**
 * The Now block of a Specification or a Task: where it stands in its workflow, why it cannot go on,
 * the latest hand-off and the one primary action. Everything comes from the workflow projection;
 * the block never branches on step ids.
 */
export function NowBlock({
  projection,
  headingId,
  status,
  links,
  gateActionFor,
  gateDocument,
  note,
  actions,
  menu,
  showHandoff = true,
  waitingContent,
  titleNote,
  summary,
  starting = false,
  hold,
  positionLine,
}: NowBlockProps) {
  const { t, i18n } = useTranslation();
  const viewer = useViewer();
  const { position, handoff } = projection;
  const when = (at: string) => formatWhen(t, at, i18n.language);
  // A Specification's Now places the step among the workflow's steps (Tasks have no outline).
  const track = stepTrack(t, projection);
  // Without a track, "Done when" names the step the work goes to.
  const done = doneWhen(projection, { withThen: track === undefined });

  let current: ReactNode;
  let facts: string | undefined;
  let supporting: ReactNode;
  switch (position.kind) {
    case 'not-started':
      current = t('workflowExecution.now.notStarted');
      // The track's label names the first step.
      facts = track
        ? undefined
        : t('workflowExecution.now.firstStep', { title: position.preview.firstStepTitle });
      break;
    case 'ready':
      current = <StepTitle step={position.next.step} />;
      facts = t('workflowExecution.now.ready');
      break;
    case 'active':
      current = <StepTitle step={position.step} />;
      facts = attemptLine(t, {
        number: position.attempt.number,
        since: formatWhen(t, position.attempt.startedAt, i18n.language, { timeOnlyToday: true }),
        actor: actorLabel(t, position.attempt.actor, viewer),
      });
      break;
    case 'awaiting-confirmation':
      // The agent's result waits for the owner: the line names who finished it and when.
      current = <StepTitle step={position.step} />;
      facts = t('workflowExecution.confirmation.line', {
        at: when(position.attempt.endedAt ?? position.attempt.startedAt),
      });
      break;
    case 'waiting':
      current = <StepTitle step={position.step} />;
      if (projection.attention?.reason === 'wait-transition-missing') {
        supporting = (
          <InlineNote tone="attention">
            {t('workflowExecution.now.waitTransitionMissing')}
          </InlineNote>
        );
        break;
      }

      if (projection.attention?.waitAttempt) {
        facts = t('workflowExecution.now.waitReadyToSettle');
        break;
      }

      facts = t('workflowExecution.now.waitingNote');
      supporting = waitingContent ?? (
        <>
          <InlineNote tone="attention" icon="clock">
            <span className="font-medium text-content-primary">
              {t('workflowExecution.now.waitingFor', {
                count: position.blockingTasks.count,
                total: position.totalTasks,
              })}
            </span>
            {links.tasks ? (
              <>
                {' '}
                <InlineAction className="ml-1" onClick={links.tasks}>
                  {t('workflowExecution.now.seeTasks')}
                </InlineAction>
              </>
            ) : null}
          </InlineNote>
          {position.attention ? (
            <InlineNote tone="attention">
              {t(`workflowExecution.now.attention.${position.attention.reason}`, {
                ids: (position.attention.taskIds ?? []).join(', '),
              })}
            </InlineNote>
          ) : null}
        </>
      );
      break;
    case 'blocked':
      if (position.preview) {
        current = t('workflowExecution.now.notStarted');
        facts = track
          ? undefined
          : t('workflowExecution.now.firstStep', { title: position.preview.firstStepTitle });
      } else if (position.next) {
        current = <StepTitle step={position.next.step} />;
        facts = t('workflowExecution.now.cannotStart');
      } else {
        current = t('workflowExecution.now.cannotStartTitle');
      }

      supporting = <StartBlockerLines blockers={position.blockers} links={links} />;
      break;
    case 'terminal':
      current = (
        <>
          <InlineIcon name={position.outcome === 'abandoned' ? 'archive' : 'circle-check'} />
          {t(`workflowExecution.now.terminal.${position.outcome}`)}
        </>
      );
      facts = position.abandonment
        ? t('workflowExecution.now.abandonedBy', {
            at: when(position.abandonment.at),
            actor: actorLabel(t, position.abandonment.actor, viewer),
          })
        : undefined;
      break;
  }

  if (starting && (position.kind === 'ready' || position.kind === 'not-started')) {
    facts = t('workflowExecution.now.starting');
  }

  // On hold, the hold leads with its reason; where the workflow stands is the quiet line under it.
  let quiet: ReactNode = positionLine ?? facts;
  if (hold) {
    quiet = (
      <>
        {current}
        {facts ? ` · ${facts}` : null}
      </>
    );
    current = (
      <>
        <InlineIcon name="circle-pause" />
        {t('workflowExecution.now.onHold')}
      </>
    );
  }

  // The results that would complete the Specification while Tasks are open, naming them.
  const tasksOpen =
    position.kind === 'active'
      ? (projection.actions.finish?.transitions ?? []).filter(
          (transition) => transition.unavailable === 'tasks-open',
        )
      : [];

  return (
    // Below a 40rem page the block is a flush band across the body padding, not a card in the sheet.
    <AccentBlock aria-labelledby={headingId} role="region" bleed="narrow" data-workflow-now="">
      <div className="grid gap-3">
        <div className="flex min-h-6 items-center justify-between gap-2">
          <Typography as="h2" variant="section-label" id={headingId} tabIndex={-1}>
            {t('workflowExecution.now.heading')}
          </Typography>
          {menu}
        </div>
        {status}
        {/* A polite live region: a refresh after an action announces the new position. */}
        <div className={cn('grid', track ? 'gap-1.5' : 'gap-0.5')} aria-live="polite">
          <Typography
            as="p"
            variant="title-sm"
            className={cn(
              position.kind === 'terminal' &&
                position.outcome === 'completed' &&
                'text-status-success',
              '[overflow-wrap:anywhere]',
            )}
          >
            {current}
          </Typography>
          {titleNote}
          {hold?.reason ? (
            <Typography
              as="p"
              variant="body-md"
              className="text-content-primary [overflow-wrap:anywhere]"
              data-now-hold-reason=""
            >
              {hold.reason}
            </Typography>
          ) : null}
          {track ? <StepTrackRow track={track} compact={position.kind === 'waiting'} /> : null}
          <Typography
            as="p"
            variant="body-sm"
            className="text-content-muted [overflow-wrap:anywhere] empty:hidden"
          >
            {quiet}
          </Typography>
        </div>
        {summary}
        {done ? (
          <DoneWhenList
            done={done}
            {...(gateActionFor ? { gateActionFor } : {})}
            {...(gateDocument ? { gateDocument } : {})}
          />
        ) : null}
        {supporting}
        {tasksOpen.map((transition) => (
          <InlineNote key={transition.id} tone="attention" data-now-tasks-open="">
            {closableInFinishDialog(transition)
              ? t('workflowExecution.now.tasksOpenDrafts', {
                  result: transitionLabel(transition),
                  tasks: (transition.openTasks ?? []).map((task) => task.taskId).join(', '),
                })
              : t('workflowExecution.now.tasksOpen', {
                  result: transitionLabel(transition),
                  tasks: openTasksText(t, transition.openTasks ?? []),
                })}
            {links.tasks ? (
              <>
                {' '}
                <InlineAction className="ml-1" onClick={links.tasks}>
                  {t('workflowExecution.now.seeTasks')}
                </InlineAction>
              </>
            ) : null}
          </InlineNote>
        ))}
        {showHandoff && handoff && position.kind !== 'terminal' ? (
          // Inside the Narrow band (one bar already) the hand-off is a labelled paragraph; in the
          // card it keeps its quote rule.
          <div
            className="grid gap-1 border-border-default @min-[40rem]/app-content:border-l-2 @min-[40rem]/app-content:pl-3"
            data-now-handoff=""
          >
            <Typography
              as="p"
              variant="label-sm"
              className="text-content-secondary @min-[40rem]/app-content:hidden"
            >
              {t('workflowExecution.now.lastHandoff')}
            </Typography>
            <Typography as="p" variant="body-sm" className="text-content-secondary">
              {/* A neutral icon with the result: the projection gives no tone for results. */}
              {handoff.kind === 'transition' ? (
                <>
                  {/* Under the band's "Last hand-off" label the step is not prefixed again. */}
                  <span className="hidden @min-[40rem]/app-content:inline">
                    {t('workflowExecution.now.lastPrefix', { step: handoff.from.title })}
                  </span>
                  <span className="@min-[40rem]/app-content:hidden">
                    {t('workflowExecution.now.handoffFrom', { step: handoff.from.title })}
                  </span>
                  <span className="font-medium text-content-primary">
                    <InlineIcon name="arrow-right" />
                    {transitionLabel({ ...handoff, id: handoff.transition })}
                  </span>
                  {handoff.from.actor ? ` · ${actorLabel(t, handoff.from.actor, viewer)}` : null}
                  {handoff.from.at ? `, ${when(handoff.from.at)}` : null}
                </>
              ) : (
                <>
                  <span className="font-medium text-content-primary">
                    <InlineIcon name="undo" />
                    {t('workflowExecution.now.returned')}
                  </span>
                  {` · ${when(handoff.at)}`}
                </>
              )}
            </Typography>
            {handoff.feedback ? (
              <Typography
                as="p"
                variant="body-sm"
                className="whitespace-pre-line text-content-primary [overflow-wrap:anywhere]"
              >
                {handoff.feedback}
              </Typography>
            ) : null}
          </div>
        ) : null}
        {note}
        {actions ? (
          <div className="flex flex-wrap gap-2" data-slot="workflow-actions">
            {actions}
          </div>
        ) : null}
      </div>
    </AccentBlock>
  );
}
