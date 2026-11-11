import { useState, type ReactNode } from 'react';
import {
  Alert,
  Badge,
  Button,
  DescriptionList,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Icon,
  RadioGroup,
  RadioGroupOption,
  TextArea,
  Timeline,
  Typography,
  cn,
} from '@nevo/ui';
import { WorkspaceSection } from '../../shared/workspace-section';
import type { Blocker, HistoryEntry, Transition, WorkflowView } from './fixtures.stories-support';

/*
 * PRESENTATION MOCK ONLY. One generic step panel for a Specification and a Task. It renders the
 * read-only action projection: position + allowed actions. It never branches on step ids.
 * The action row is the single slot where a later "Do it myself / Ask agent" choice attaches.
 */

const noop = () => undefined;

function Step({ children }: { children: ReactNode }) {
  // Step ids are user-defined identifiers: shown as written, mono, never translated.
  return <span className="font-mono">{children}</span>;
}

function BlockerList({ blockers, label }: { blockers: readonly Blocker[]; label: string }) {
  return (
    // One stable two-line unit at every width: id gutter, then title over state.
    <ul aria-label={label} className="grid gap-2">
      {blockers.map((blocker) => (
        <li key={blocker.id} className="flex min-w-0 items-baseline gap-2 text-left">
          <span className="w-12 shrink-0 font-mono text-body-sm text-content-muted">
            {blocker.id}
          </span>
          <span className="grid min-w-0 flex-1">
            <a
              href={`#${blocker.id}`}
              className="block min-w-0 truncate text-body-sm text-content-primary hover:text-content-link"
            >
              {blocker.title}
            </a>
            <span
              className={cn(
                'text-body-sm text-content-secondary',
                blocker.tone === 'attention' && 'text-status-attention',
                blocker.tone === 'info' && 'text-status-info',
              )}
            >
              {blocker.state}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export interface WorkflowPanelProps {
  readonly view: WorkflowView;
  /** Label of the start action for a not-started workflow (subject-specific wording). */
  readonly startLabel?: string;
  readonly onStart?: () => void;
  readonly onFinish?: () => void;
  readonly onReturn?: () => void;
  /** Narrow only: opens the history that the Secondary shows on split layouts. */
  readonly onHistory?: () => void;
  readonly headingId: string;
}

/** The panel: current position first, the latest hand-off second, then the allowed actions. */
export function WorkflowPanel({
  view,
  startLabel,
  onStart = noop,
  onFinish = noop,
  onReturn = noop,
  onHistory,
  headingId,
}: WorkflowPanelProps) {
  const { position, definition } = view;
  const canFinish = position.kind === 'active' && (view.transitions?.length ?? 0) > 0;
  const canReturn = (view.returnSteps?.length ?? 0) > 0;
  const canStart =
    view.canStart === true && (position.kind === 'not-started' || position.kind === 'ready');

  let current: ReactNode;
  let facts: string | undefined;
  let supporting: ReactNode;

  switch (position.kind) {
    case 'not-started':
      current = 'Not started';
      facts = `First step `;
      supporting = view.unavailableReason ? (
        <Typography variant="body-sm" className="text-content-secondary">
          {view.unavailableReason}
        </Typography>
      ) : undefined;
      break;
    case 'ready':
      current = <Step>{position.step}</Step>;
      facts = `Ready to start · attempt ${position.attempt}`;
      break;
    case 'active':
      current = <Step>{position.step}</Step>;
      facts = `Attempt ${position.attempt} · in progress since ${position.since} · started by ${position.actor}`;
      break;
    case 'waiting':
      current = <Step>{position.step}</Step>;
      facts = position.note;
      supporting = (
        <div className="grid gap-2">
          <span className="inline-flex items-start gap-1.5 text-body-sm font-medium text-status-attention">
            <Icon name="clock" size="sm" className="mt-0.5 shrink-0" />
            {position.reason}
          </span>
          <BlockerList blockers={position.blockers} label="Blocking" />
        </div>
      );
      break;
    case 'terminal':
      current = 'Completed';
      facts = position.summary;
      break;
  }

  const latest = view.latest;

  return (
    <WorkspaceSection aria-labelledby={headingId}>
      <WorkspaceSection.Header
        id={headingId}
        title="Workflow"
        icon="workflow"
        count={`${definition.title} · rev ${definition.revision}`}
        actions={
          onHistory ? (
            <Button variant="ghost" size="sm" onClick={onHistory}>
              History
            </Button>
          ) : undefined
        }
      />
      <div className="grid gap-3">
        <div className="grid gap-0.5">
          <Typography
            as="p"
            variant="title-sm"
            className={cn(position.kind === 'terminal' && 'text-status-success')}
          >
            {position.kind === 'terminal' ? (
              <span className="inline-flex items-center gap-1.5">
                <Icon name="circle-check" size="sm" />
                {current}
              </span>
            ) : (
              current
            )}
          </Typography>
          {facts ? (
            <Typography as="p" variant="body-sm" className="text-content-muted">
              {facts}
              {position.kind === 'not-started' ? <Step>{position.firstStep}</Step> : null}
            </Typography>
          ) : null}
        </div>
        {supporting}
        {latest && position.kind !== 'terminal' ? (
          <div className="grid gap-1 border-l-2 border-border-default pl-3">
            <Typography as="p" variant="body-sm" className="text-content-secondary">
              {latest.returned ? 'Returned from ' : 'Last: '}
              <Step>{latest.fromStep}</Step> · attempt {latest.attempt} ·{' '}
              <span
                className={cn(
                  latest.toStep !== null && latest.feedback && 'font-medium text-status-attention',
                )}
              >
                {latest.result}
              </span>{' '}
              · {latest.actor}, {latest.at}
            </Typography>
            {latest.feedback ? (
              <Typography as="p" variant="body-sm" className="text-content-primary">
                {latest.feedback}
              </Typography>
            ) : null}
          </div>
        ) : null}
        {canStart || canFinish || canReturn ? (
          <div className="flex flex-wrap gap-2" data-slot="workflow-actions">
            {canStart ? <Button onClick={onStart}>{startLabel ?? 'Start step'}</Button> : null}
            {canFinish ? <Button onClick={onFinish}>Finish step…</Button> : null}
            {canReturn ? (
              <Button variant="secondary" onClick={onReturn}>
                Return to earlier step…
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </WorkspaceSection>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Finish                                                                                       */
/* ------------------------------------------------------------------------------------------ */

function transitionDescription(transition: Transition) {
  const target = transition.to === null ? 'Ends the workflow' : `Goes to ${transition.to}`;

  return transition.feedback === 'required' ? `${target} · feedback required` : target;
}

export function FinishStepDialog({
  step,
  attempt,
  transitions,
  initialTransition,
  initialFeedback = '',
  artifacts = [],
  showMissingFeedback = false,
}: {
  step: string;
  attempt: number;
  transitions: readonly Transition[];
  initialTransition?: string;
  initialFeedback?: string;
  artifacts?: readonly string[];
  showMissingFeedback?: boolean;
}) {
  const [value, setValue] = useState(initialTransition ?? '');
  const selected = transitions.find((transition) => transition.id === value);
  const required = selected?.feedback === 'required';
  const missing = showMissingFeedback && required && initialFeedback.trim() === '';

  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Finish <Step>{step}</Step>
          </DialogTitle>
          <DialogDescription>
            Attempt {attempt}. You are recorded as the person who finished it.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-6">
          <RadioGroup
            value={value}
            onValueChange={setValue}
            aria-label="Result"
            className="grid gap-4"
          >
            <Typography as="p" variant="label-sm">
              Result
            </Typography>
            {transitions.map((transition) => (
              <RadioGroupOption
                key={transition.id}
                value={transition.id}
                label={transition.label}
                description={transitionDescription(transition)}
              />
            ))}
          </RadioGroup>
          <Field invalid={missing}>
            <Field.Label>{required ? 'Feedback (required)' : 'Feedback (optional)'}</Field.Label>
            <TextArea rows={4} defaultValue={initialFeedback} />
            {missing ? (
              <Field.Error>This result needs feedback for the next step.</Field.Error>
            ) : (
              <Field.Description>Shown to whoever works on the next step.</Field.Description>
            )}
          </Field>
          <div className="grid gap-2">
            <Typography as="p" variant="label-sm">
              Artifacts (optional)
            </Typography>
            {artifacts.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {artifacts.map((artifact) => (
                  <Badge key={artifact} tone="neutral">
                    {artifact}
                  </Badge>
                ))}
              </div>
            ) : null}
            <div>
              <Button variant="ghost" size="sm" leadingIcon="file">
                Attach document…
              </Button>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary">Cancel</Button>
          <Button disabled={!selected || missing}>Finish step</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Return                                                                                       */
/* ------------------------------------------------------------------------------------------ */

export function ReturnStepDialog({
  current,
  steps,
}: {
  current: string;
  steps: readonly string[];
}) {
  const [value, setValue] = useState(steps[steps.length - 1] ?? '');

  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Return to an earlier step</DialogTitle>
          <DialogDescription>
            Ends the current attempt of <Step>{current}</Step> without a result. The earlier step
            starts a new attempt.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-6">
          <RadioGroup
            value={value}
            onValueChange={setValue}
            aria-label="Step"
            className="grid gap-4"
          >
            <Typography as="p" variant="label-sm">
              Return to
            </Typography>
            {steps.map((step) => (
              <RadioGroupOption key={step} value={step} label={<Step>{step}</Step>} />
            ))}
          </RadioGroup>
          <Field>
            <Field.Label>Reason (required)</Field.Label>
            <TextArea
              rows={3}
              defaultValue="The provider rejects the refresh grant; the approach from the spike needs to change."
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary">Cancel</Button>
          <Button>Return to {value}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* First start of a Task: binding confirmation and refusals                                     */
/* ------------------------------------------------------------------------------------------ */

export type StartRefusal = 'definition-changed' | 'task-type-not-allowed';

export function StartTaskDialog({
  taskId,
  taskType,
  workflow,
  revision,
  firstStep,
  refusal,
}: {
  taskId: string;
  taskType: string;
  workflow: string;
  revision: number;
  firstStep: string;
  refusal?: StartRefusal;
}) {
  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start {taskId}</DialogTitle>
          <DialogDescription>
            {refusal
              ? 'This task cannot start with the definitions it was created with.'
              : 'Starting fixes the workflow this task follows until it ends. Later changes to the task type or workflow do not affect it.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-5">
          {refusal === 'definition-changed' ? (
            <Alert tone="attention" title={`The ${workflow} workflow changed`}>
              The task was created with revision {revision}; the current revision is {revision + 1}.
              Review the difference and use the current revision, or leave the task unstarted.
            </Alert>
          ) : null}
          {refusal === 'task-type-not-allowed' ? (
            <Alert tone="danger" title={`${taskType} is no longer allowed here`}>
              The Feature archetype now allows Backend and UI tasks. Change the task type to start
              this task, or cancel it.
            </Alert>
          ) : null}
          <DescriptionList>
            <DescriptionList.Item>
              <DescriptionList.Term>Task type</DescriptionList.Term>
              <DescriptionList.Detail>{taskType}</DescriptionList.Detail>
            </DescriptionList.Item>
            <DescriptionList.Item>
              <DescriptionList.Term>Workflow</DescriptionList.Term>
              <DescriptionList.Detail>
                {refusal === 'definition-changed'
                  ? `${workflow} · rev ${revision} → rev ${revision + 1}`
                  : `${workflow} · rev ${revision}`}
              </DescriptionList.Detail>
            </DescriptionList.Item>
            {refusal === 'definition-changed' ? (
              <DescriptionList.Item>
                <DescriptionList.Term>Change</DescriptionList.Term>
                <DescriptionList.Detail>
                  Adds step <Step>security-review</Step> after <Step>review</Step>
                </DescriptionList.Detail>
              </DescriptionList.Item>
            ) : null}
            <DescriptionList.Item>
              <DescriptionList.Term>First step</DescriptionList.Term>
              <DescriptionList.Detail>
                <Step>{firstStep}</Step>
              </DescriptionList.Detail>
            </DescriptionList.Item>
          </DescriptionList>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary">Cancel</Button>
          {refusal === 'definition-changed' ? (
            <Button>Use rev {revision + 1} and start</Button>
          ) : refusal === 'task-type-not-allowed' ? (
            <Button>Change task type…</Button>
          ) : (
            <Button>Start {firstStep}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* History (Secondary)                                                                          */
/* ------------------------------------------------------------------------------------------ */

export function WorkflowHistory({
  entries,
  label,
}: {
  entries: readonly HistoryEntry[];
  label: string;
}) {
  return (
    <Timeline size="md" aria-label={label}>
      {entries.map((entry) => (
        <Timeline.Item
          key={`${entry.step}-${entry.attempt}`}
          aria-current={entry.active ? 'step' : undefined}
        >
          <Timeline.Marker tone={entry.tone ?? 'neutral'} active={entry.active} />
          <Timeline.Content
            meta={`${entry.at} · ${entry.actor}`}
            title={
              <span>
                <Step>{entry.step}</Step> · attempt {entry.attempt}
                {entry.toStep !== undefined ? (
                  <span className="font-normal text-content-secondary">
                    {' '}
                    → {entry.toStep ?? 'end'}
                  </span>
                ) : null}
              </span>
            }
            description={
              <span className="grid gap-1">
                <span
                  className={cn(
                    entry.active && 'text-status-info',
                    entry.tone === 'attention' && 'font-medium text-status-attention',
                  )}
                >
                  {entry.active ? 'In progress' : entry.result}
                </span>
                {entry.feedback ? (
                  <span className="text-content-primary">{entry.feedback}</span>
                ) : null}
                {entry.artifacts?.length ? (
                  <span className="text-content-muted">
                    Artifacts: {entry.artifacts.join(', ')}
                  </span>
                ) : null}
              </span>
            }
          />
        </Timeline.Item>
      ))}
    </Timeline>
  );
}
