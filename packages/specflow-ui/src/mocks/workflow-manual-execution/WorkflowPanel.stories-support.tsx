import { useRef, useState, type ComponentProps, type ReactNode } from 'react';
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
  InlineNote,
  RadioGroup,
  RadioGroupOption,
  TextArea,
  Timeline,
  Typography,
  cn,
} from '@nevo/ui';
import { WorkspaceSection } from '../../shared/workspace-section';
import type { HistoryEntry, Transition, WorkflowView } from './fixtures.stories-support';

/*
 * PRESENTATION MOCK ONLY. One generic step panel for a Specification and a Task. It renders the
 * read-only action projection: position + allowed actions. It never branches on step ids.
 * The action row is the single slot where a later "Do it myself / Ask agent" choice attaches.
 */

const noop = () => undefined;

/**
 * An icon inside running text: it sits on the text line, optically centred on the x-height, with no
 * flex box around it (a flex box shifts the whole chunk off the line). Standalone status lines use
 * the design-system InlineNote instead.
 */
export function InlineIcon({ name }: { name: ComponentProps<typeof Icon>['name'] }) {
  return (
    <Icon
      name={name}
      size="sm"
      aria-hidden="true"
      className="mr-1 inline-block shrink-0 align-[-0.1875rem]"
    />
  );
}

function Step({ children }: { children: ReactNode }) {
  // Step ids are user-defined identifiers: shown as written, mono, never translated.
  return <span className="font-mono">{children}</span>;
}

export interface WorkflowPanelProps {
  readonly view: WorkflowView;
  /** Label of the start action for a not-started workflow (subject-specific wording). */
  readonly startLabel?: string;
  readonly onStart?: () => void;
  readonly onFinish?: () => void;
  readonly onReturn?: () => void;
  readonly headingId: string;
}

/** The panel: current position first, the latest hand-off second, then the allowed actions. */
export function WorkflowPanel({
  view,
  startLabel,
  onStart = noop,
  onFinish = noop,
  onReturn = noop,
  headingId,
}: WorkflowPanelProps) {
  const { position, definition } = view;
  const canFinish = position.kind === 'active' && (view.transitions?.length ?? 0) > 0;
  const canReturn = (view.returnSteps?.length ?? 0) > 0;
  const canStart =
    view.canStart === true && (position.kind === 'not-started' || position.kind === 'ready');
  const abandoned = position.kind === 'terminal' && position.outcome === 'abandoned';

  let current: ReactNode;
  let facts: ReactNode;
  let supporting: ReactNode;

  switch (position.kind) {
    case 'not-started':
      current = 'Not started';
      facts = (
        <>
          First step <Step>{position.firstStep}</Step>
        </>
      );
      supporting = view.unavailableReason ? (
        <InlineNote tone="info">{view.unavailableReason}</InlineNote>
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
      // The blocking work is listed once, in its own section; the panel says how much and links.
      supporting = (
        <InlineNote tone="attention" icon="clock">
          <span className="font-medium text-content-primary">{position.reason}</span>{' '}
          <a
            href={position.see.href}
            className="ml-1 text-content-link underline-offset-2 hover:underline"
          >
            {position.see.label}
          </a>
        </InlineNote>
      );
      break;
    case 'terminal':
      current = abandoned ? 'Abandoned' : 'Completed';
      facts = position.summary;
      break;
  }

  const latest = view.latest;
  const latestNeedsAttention = latest?.attention === true;

  return (
    <WorkspaceSection aria-labelledby={headingId}>
      <WorkspaceSection.Header
        id={headingId}
        title="Workflow"
        icon="workflow"
        count={`${definition.title} · rev ${definition.revision}`}
      />
      <div className="grid gap-3">
        {/* The position is a polite live region: a refresh after an action announces the change. */}
        <div className="grid gap-0.5" aria-live="polite">
          <Typography
            as="p"
            variant="title-sm"
            className={cn(position.kind === 'terminal' && !abandoned && 'text-status-success')}
          >
            {position.kind === 'terminal' ? (
              <>
                <InlineIcon name={abandoned ? 'archive' : 'circle-check'} />
                {current}
              </>
            ) : (
              current
            )}
          </Typography>
          {facts ? (
            <Typography as="p" variant="body-sm" className="text-content-muted">
              {facts}
            </Typography>
          ) : null}
        </div>
        {supporting}
        {latest && position.kind !== 'terminal' ? (
          <div className="grid gap-1 border-l-2 border-border-default pl-3">
            <Typography as="p" variant="body-sm" className="text-content-secondary">
              {latest.returned ? 'Returned from ' : 'Last: '}
              <Step>{latest.fromStep}</Step> · attempt {latest.attempt} ·{' '}
              {latestNeedsAttention ? (
                <span className="font-medium text-status-attention">
                  <InlineIcon name="triangle-alert" />
                  {latest.result}
                </span>
              ) : (
                latest.result
              )}{' '}
              · {latest.actor}, {latest.at}
            </Typography>
            {latest.feedback ? (
              <Typography as="p" variant="body-sm" className="text-content-primary">
                {latest.feedback}
              </Typography>
            ) : null}
          </div>
        ) : null}
        {/*
         * The action row. E6 adds the executor choice to the start action of an eligible step in
         * this slot (Start step ▸ Do it myself / Ask agent); the primary stays "Start step".
         */}
        {canStart || canFinish || canReturn ? (
          <div className="flex flex-wrap gap-2" data-slot="workflow-actions">
            {canStart ? <Button onClick={onStart}>{startLabel ?? 'Start step'}</Button> : null}
            {canFinish ? <Button onClick={onFinish}>Finish step</Button> : null}
            {canReturn ? (
              <Button variant="secondary" onClick={onReturn}>
                Return to earlier step
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
              <Field.Error role="alert">This result needs feedback for the next step.</Field.Error>
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
                Attach document
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
              defaultValue="The provider rejects the refresh grant; the design needs to change before implementing further."
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

/**
 * `definition-changed`: the live definition differs from the Task's creation binding.
 * `changed-since-preview`: the confirm sent the previewed revision and the Engine refused because
 * the definition changed while the dialog was open; the dialog re-opens on the new revision.
 * `task-type-not-allowed`: the archetype no longer allows the Task Type (immutable: remove and
 * recreate).
 */
export type StartRefusal = 'definition-changed' | 'changed-since-preview' | 'task-type-not-allowed';

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
  const dismissRef = useRef<HTMLButtonElement>(null);
  const changed = refusal === 'definition-changed' || refusal === 'changed-since-preview';
  const shown = changed ? revision + 1 : revision;

  return (
    <Dialog open>
      <DialogContent
        onOpenAutoFocus={(event) => {
          // A refusal opens on the harmless dismiss, never on a consequential action.
          if (refusal) {
            event.preventDefault();
            dismissRef.current?.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Start {taskId}</DialogTitle>
          <DialogDescription>
            {refusal === 'task-type-not-allowed'
              ? 'This task cannot start.'
              : `Starting fixes the workflow this task follows until it ends. You confirm rev ${shown}; if it changes before you confirm, nothing starts and this dialog shows the new revision.`}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-5">
          {refusal === 'definition-changed' ? (
            <Alert role="alert" tone="attention" title={`The ${workflow} workflow changed`}>
              The task was created with rev {revision}; the current revision is rev {revision + 1}.
              Review the change and start with it, or leave the task unstarted.
            </Alert>
          ) : null}
          {refusal === 'changed-since-preview' ? (
            <Alert role="alert" tone="attention" title="Not started: the workflow changed just now">
              You confirmed rev {revision}, but {workflow} is now rev {revision + 1}. Review the
              change below and confirm again.
            </Alert>
          ) : null}
          {refusal === 'task-type-not-allowed' ? (
            <Alert role="alert" tone="danger" title={`${taskType} is no longer allowed`}>
              {taskType} is no longer allowed for Feature specifications. A task keeps its type, so
              remove this task and create a new one with an allowed type, or cancel it.
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
                {changed
                  ? `${workflow} · rev ${revision} → rev ${revision + 1}`
                  : `${workflow} · rev ${revision}`}
              </DescriptionList.Detail>
            </DescriptionList.Item>
            {changed ? (
              <DescriptionList.Item>
                <DescriptionList.Term>Change</DescriptionList.Term>
                <DescriptionList.Detail>
                  Adds step <Step>security-review</Step> after <Step>review</Step>
                </DescriptionList.Detail>
              </DescriptionList.Item>
            ) : null}
            {refusal === 'task-type-not-allowed' ? null : (
              <DescriptionList.Item>
                <DescriptionList.Term>First step</DescriptionList.Term>
                <DescriptionList.Detail>
                  <Step>{firstStep}</Step>
                </DescriptionList.Detail>
              </DescriptionList.Item>
            )}
          </DescriptionList>
        </DialogBody>
        <DialogFooter>
          <Button ref={dismissRef} variant="secondary">
            {refusal === 'task-type-not-allowed' ? 'Not now' : 'Cancel'}
          </Button>
          {refusal === 'task-type-not-allowed' ? (
            <>
              <Button variant="secondary">Cancel task</Button>
              <Button variant="destructive">Remove task</Button>
            </>
          ) : (
            <Button>{changed ? `Start with rev ${revision + 1}` : `Start ${firstStep}`}</Button>
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
                  {entry.tone === 'attention' ? <InlineIcon name="triangle-alert" /> : null}
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
