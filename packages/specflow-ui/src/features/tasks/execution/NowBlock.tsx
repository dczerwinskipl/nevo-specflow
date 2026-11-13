import type { ComponentProps, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AccentBlock, Icon, InlineNote, Typography, cn } from '@nevo/ui';
import type { GateStatus, WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { GateList, type GateAction } from './GateList';
import { InlineAction } from './InlineAction';
import { actorLabel, formatWhen } from './presentation';
import { StartBlockerLines, type NowLinks } from './StartBlockerLines';

/** An icon inside running text: on the text line, no flex box that would shift the line. */
function InlineIcon({ name }: { name: ComponentProps<typeof Icon>['name'] }) {
  return (
    <span className="mr-1 inline-flex h-[1lh] items-center align-top">
      <Icon name={name} size="sm" aria-hidden="true" />
    </span>
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
  /** A transient line just above the actions (a kept finish draft, a post-action notice). */
  readonly note?: ReactNode;
  /**
   * The action row. It is the single attachment point of a later executor choice (Do it myself /
   * Ask agent) on the start action; nothing else in the block changes for it.
   */
  readonly actions?: ReactNode;
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
  note,
  actions,
}: NowBlockProps) {
  const { t, i18n } = useTranslation();
  const { position, workflow, handoff } = projection;
  const when = (at: string) => formatWhen(at, i18n.language);
  const workflowLine = workflow
    ? t('workflowExecution.now.workflow', { title: workflow.title, version: workflow.version })
    : undefined;

  let current: ReactNode;
  let facts: string | undefined;
  let stepId: string | undefined;
  let supporting: ReactNode;
  switch (position.kind) {
    case 'not-started':
      current = t('workflowExecution.now.notStarted');
      facts = t('workflowExecution.now.firstStep', { title: position.preview.firstStepTitle });
      break;
    case 'ready':
      current = <StepTitle step={position.next.step} />;
      facts = t('workflowExecution.now.ready');
      stepId = position.next.step.id;
      break;
    case 'active':
      current = <StepTitle step={position.step} />;
      facts = t('workflowExecution.now.active', {
        attempt: position.attempt.number,
        since: when(position.attempt.startedAt),
        actor: actorLabel(position.attempt.actor),
      });
      stepId = position.step.id;
      break;
    case 'waiting':
      current = <StepTitle step={position.step} />;
      facts = t('workflowExecution.now.waitingNote');
      stepId = position.step.id;
      supporting = (
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
        facts = t('workflowExecution.now.firstStep', { title: position.preview.firstStepTitle });
      } else if (position.next) {
        current = <StepTitle step={position.next.step} />;
        facts = t('workflowExecution.now.cannotStart');
        stepId = position.next.step.id;
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
            actor: actorLabel(position.abandonment.actor),
          })
        : undefined;
      break;
  }

  // The exit gates of the active step that are not met yet, per result ("To finish with Done:").
  const unmet =
    position.kind === 'active'
      ? (projection.actions.finish?.transitions ?? []).flatMap((transition) => {
          const gates = (transition.gates ?? []).filter((gate) => gate.status === 'unsatisfied');

          return gates.length > 0 ? [{ transition, gates }] : [];
        })
      : [];

  return (
    <AccentBlock aria-labelledby={headingId} role="region" data-workflow-now="">
      <div className="grid gap-3">
        <Typography as="h2" variant="section-label" id={headingId} tabIndex={-1}>
          {t('workflowExecution.now.heading')}
        </Typography>
        {status}
        {/* A polite live region: a refresh after an action announces the new position. */}
        <div className="grid gap-0.5" aria-live="polite">
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
          <Typography
            as="p"
            variant="body-sm"
            className="text-content-muted [overflow-wrap:anywhere]"
          >
            {[facts, stepId, workflowLine].filter(Boolean).length > 0 ? (
              <>
                {facts ? `${facts} · ` : null}
                {stepId ? (
                  <>
                    <span className="font-mono">{stepId}</span>
                    {workflowLine ? ' · ' : null}
                  </>
                ) : null}
                {workflowLine}
              </>
            ) : null}
          </Typography>
        </div>
        {supporting}
        {unmet.map(({ transition, gates }) => {
          const result = transition.label ?? transition.result ?? transition.id;

          return (
            <div key={transition.id} className="grid gap-1.5">
              <Typography as="p" variant="body-sm" className="text-content-secondary">
                {t('workflowExecution.now.toFinishWith', { result })}
              </Typography>
              <GateList
                gates={gates}
                label={t('workflowExecution.finish.gatesFor', { result })}
                actionFor={gateActionFor}
              />
            </div>
          );
        })}
        {handoff && position.kind !== 'terminal' ? (
          <div className="grid gap-1 border-l-2 border-border-default pl-3">
            <Typography as="p" variant="body-sm" className="text-content-secondary">
              {handoff.kind === 'transition'
                ? t('workflowExecution.now.last', {
                    step: handoff.from.title,
                    result: handoff.label ?? handoff.result ?? handoff.transition,
                  })
                : t('workflowExecution.now.returned')}
              {handoff.kind === 'transition' && handoff.from.actor
                ? ` · ${actorLabel(handoff.from.actor)}`
                : null}
              {handoff.kind === 'transition' && handoff.from.at
                ? `, ${when(handoff.from.at)}`
                : handoff.kind === 'return'
                  ? ` · ${when(handoff.at)}`
                  : null}
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
