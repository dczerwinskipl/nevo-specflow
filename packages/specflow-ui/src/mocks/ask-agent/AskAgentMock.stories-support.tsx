import { useId, useState, type ReactNode } from 'react';
import { Bot, ChevronDown, CircleStop, GitCommitHorizontal } from 'lucide-react';
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  IconButton,
  InformationList,
  InlineNote,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  TextArea,
  Timeline,
  Typography,
} from '@nevo/ui';
import { NowBlock } from '../../features/tasks/execution/NowBlock';
import { NowOperationsMenu } from '../../features/tasks/execution/NowOperationsMenu';
import { WorkflowExecutionFixture } from '../../features/tasks/execution/ProjectWorkflowExecution.stories-support';
import { specificationWorkflowProjection } from '../../features/tasks/execution/projections.stories-support';
import { ModelEffortPicker } from '../../features/sessions/managed/ModelEffortPicker';
import { SessionProviderIcon } from '../../features/sessions/shared/SessionProviderIcon';
import { AgentPicker } from '../../features/sessions/start/fields/AgentPicker';
import { codexClaudeCatalogue } from '../../features/sessions/start/catalogue/startCatalogue.stories-support';
import { StoryLocalization } from '../../i18n/StoryLocalization';
import { OperationalRow } from '../../shared/operational-list';
import { AGENT_FILES, CloseUncommittedDialog } from './CloseMock.stories-support';
import {
  BRANCH,
  SESSION_TITLE,
  agentImplementation,
  breakdownAwaitingConfirmation,
  readyImplementation,
  readyReviewAfterAgent,
  takenOverImplementation,
} from './fixtures.stories-support';
import {
  Branch,
  CheckoutPath,
  Goal,
  Group,
  LineIcon,
  MONO,
  PathList,
  QuoteBlock,
  Replace,
  TextLink,
  findDeepest,
  findHistoryList,
  findNow,
} from './MockParts.stories-support';

/*
 * PRESENTATION MOCK ONLY (design validation for docs/product/specflow/ui/workflow-execution.md,
 * "Ask agent"). The real routed Full Task page or Specification Overview, with only the Now block
 * (or another region the state changes) replaced by the mock's, and the mock's dialogs open over
 * it. Static data, no commands; no interaction tests.
 *
 * One story, one sequence of times (local time of the fixtures): Review asked for changes at
 * 12:40 PM; the agent started Implementation attempt 2 at 12:52 PM and either finished at 1:18 PM
 * (finished stories) or stopped without a result at 1:10 PM, after which the owner took over at
 * 1:15 PM (attempt 3).
 */

export type AskAgentState =
  | 'entry-a-two-buttons'
  | 'entry-b-split'
  | 'dialog-fresh'
  | 'dialog-continue'
  | 'dialog-independent'
  | 'dialog-dirty'
  | 'dialog-no-agent'
  | 'dialog-session-unavailable'
  | 'running'
  | 'stopping'
  | 'return-requested'
  | 'outcome-unknown'
  | 'outcome-unknown-other'
  | 'finished-committed'
  | 'finished-commit-failed'
  | 'ended-without-finish'
  | 'proposal-refused'
  | 'continue-refused'
  | 'confirm-pending'
  | 'confirm-reject'
  | 'take-over'
  | 'taken-over-history'
  | 'close-uncommitted';

const noop = () => undefined;
const links = {};

const claudeProvider = {
  capabilities: { modelOverride: true, effortOverride: true },
  models: [
    { modelId: 'sonnet-5', title: 'Claude Sonnet 5', efforts: ['medium', 'high'] },
    { modelId: 'opus-5', title: 'Claude Opus 5', efforts: ['medium', 'high'] },
  ],
};

/** The Now block's ⋯ menu as it is today (Return, Workflow history, the step id note). */
function OperationsMenu() {
  return (
    <NowOperationsMenu
      operations={[{ id: 'return', label: 'Return to an earlier step', onSelect: noop }]}
      onOpenHistory={noop}
      note={['Step implement · Build and review rev 4']}
    />
  );
}

/** The agent's Session in a position line: its mark and its title as a link. */
function SessionLink({ title = SESSION_TITLE }: { readonly title?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="inline-flex h-[1lh] items-center self-start">
        <SessionProviderIcon providerId="claude" />
      </span>
      <TextLink>{title}</TextLink>
    </span>
  );
}

const goal = <Goal text="Write the code and its tests so the behaviour in task.md works." />;
const reviewGoal = <Goal text="Check the change against task.md and record what was verified." />;

function StartActions({ askDisabled = false }: { readonly askDisabled?: boolean }) {
  return (
    <>
      <Button disabled={askDisabled}>Start step</Button>
      <Button variant="secondary" leadingIcon={Bot} disabled={askDisabled}>
        Ask agent
      </Button>
    </>
  );
}

/* ------------------------------------------------------------------ Now blocks of each state */

/** A: the manual start stays the main action; Ask agent is the one button-styled secondary. */
function EntryTwoButtons() {
  return (
    <NowBlock
      projection={readyImplementation()}
      headingId="now-mock"
      links={links}
      menu={<OperationsMenu />}
      summary={goal}
      actions={<StartActions />}
    />
  );
}

/** B: one split button; its menu holds both ways (the contract's first sketch). */
function EntrySplit() {
  return (
    <NowBlock
      projection={readyImplementation()}
      headingId="now-mock"
      links={links}
      menu={<OperationsMenu />}
      summary={goal}
      actions={
        <div className="inline-flex">
          <Button className="rounded-r-none">Start step</Button>
          <Menu modal={false} defaultOpen>
            <MenuTrigger asChild>
              <IconButton
                icon={ChevronDown}
                aria-label="More ways to start"
                className="rounded-l-none border-l border-l-black/20"
                variant="primary"
              />
            </MenuTrigger>
            <MenuContent align="start">
              <MenuItem onSelect={noop}>Do it myself</MenuItem>
              <MenuItem leadingIcon={Bot} onSelect={noop}>
                Ask agent
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      }
    />
  );
}

type Waiting = 'running' | 'stopping' | 'return-requested' | 'outcome-unknown';

/** The agent's attempt while its process runs, is asked to stop, or may still run. */
function AgentAttempt({ kind }: { readonly kind: Waiting }) {
  const line = {
    running: 'Attempt 2 · agent working since Nov 13, 12:52 PM · ',
    stopping: 'Attempt 2 · stopping the agent · ',
    'return-requested': 'Attempt 2 · return requested · waiting for the agent to stop · ',
    'outcome-unknown': 'Attempt 2 · the agent’s outcome is unknown · ',
  }[kind];

  const note = {
    running: undefined,
    stopping: (
      <InlineNote tone="info" icon="loader">
        Asked the agent to stop. Implementation stays locked until SpecFlow sees its process has
        ended; then you can continue, take over or return.
      </InlineNote>
    ),
    'return-requested': (
      <InlineNote tone="info" icon="loader">
        You asked to return to Design. SpecFlow is stopping the agent first: the step goes back to
        Design only once its process has ended, so nothing it still writes is lost or mixed into the
        next attempt.
      </InlineNote>
    ),
    'outcome-unknown': (
      <InlineNote tone="danger" role="alert">
        <span className="font-medium text-content-primary">
          SpecFlow cannot tell whether the agent is still working.
        </span>{' '}
        Its process may still be running, so nothing can be saved anywhere in this project until
        that is known: steps, documents and tasks of every specification wait. Check outcome asks
        the machine running SpecFlow again. If it still cannot tell, end the agent’s process there,
        then check again.
      </InlineNote>
    ),
  }[kind];

  const actions = {
    running: (
      <Button variant="secondary" leadingIcon={CircleStop}>
        Stop agent
      </Button>
    ),
    stopping: (
      <Button variant="secondary" disabled aria-busy>
        Stopping…
      </Button>
    ),
    'return-requested': (
      <Button variant="secondary" disabled aria-busy>
        Returning…
      </Button>
    ),
    'outcome-unknown': <Button leadingIcon="refresh">Check outcome</Button>,
  }[kind];

  return (
    <NowBlock
      projection={agentImplementation()}
      headingId="now-mock"
      links={links}
      menu={kind === 'running' ? <OperationsMenu /> : undefined}
      positionLine={
        <>
          {line}
          <SessionLink />
        </>
      }
      summary={goal}
      note={note}
      actions={actions}
    />
  );
}

/** Another subject while an agent's outcome is unknown: every change waits, and says why. */
function OtherSubjectBlocked() {
  return (
    <NowBlock
      projection={specificationWorkflowProjection('waiting')}
      headingId="now-mock"
      links={links}
      showHandoff={false}
      note={
        <InlineNote tone="attention" role="alert">
          <span className="font-medium text-content-primary">
            Nothing can be saved in this project right now.
          </span>{' '}
          SpecFlow cannot tell whether the agent working on t-04 is still running. Open t-04 to
          check its outcome. <TextLink>Open t-04</TextLink>
        </InlineNote>
      }
    />
  );
}

function FinishedCommitted() {
  return (
    <NowBlock
      projection={readyReviewAfterAgent()}
      headingId="now-mock"
      links={links}
      menu={<OperationsMenu />}
      summary={reviewGoal}
      note={
        <InlineNote tone="info" icon={GitCommitHorizontal}>
          The agent finished Implementation. Committed <span className={MONO}>3f2a9c1</span> on{' '}
          <Branch name={BRANCH} />: 2 documents and 3 files. <TextLink>Show commit</TextLink>
        </InlineNote>
      }
      actions={<StartActions />}
    />
  );
}

function FinishedCommitFailed() {
  return (
    <NowBlock
      projection={readyReviewAfterAgent()}
      headingId="now-mock"
      links={links}
      menu={<OperationsMenu />}
      summary={reviewGoal}
      note={
        <InlineNote tone="attention" role="alert">
          <span className="font-medium text-content-primary">
            Implementation is finished, but its commit failed: a Git hook in this repository refused
            it (<span className={MONO}>COMMIT_HOOK_FAILED</span>).
          </span>{' '}
          These 5 files stay uncommitted on <Branch name={BRANCH} />, and Close lists them until
          they are committed. Until then Ask agent cannot start Review: an agent starts only from a
          committed checkout.
          <PathList paths={AGENT_FILES} />
          <div className="mt-2">
            <Button size="sm" variant="secondary" leadingIcon={GitCommitHorizontal}>
              Retry commit
            </Button>
          </div>
        </InlineNote>
      }
      actions={<StartActions />}
    />
  );
}

/** The agent's work so far, as the unresolved attempt lists it. */
function PartialWork() {
  return (
    <Typography as="p" variant="body-sm" className="text-content-secondary">
      Kept so far: <TextLink>task.md</TextLink>, <TextLink>screens.md</TextLink> and 3 changed
      files. <TextLink>See the attempt</TextLink>
    </Typography>
  );
}

function Unresolved({ kind }: { readonly kind: 'ended' | 'refused' | 'continue-refused' }) {
  const line =
    kind === 'refused'
      ? 'Attempt 2 · the agent’s result was not accepted · '
      : 'Attempt 2 · the agent stopped without a result at 1:10 PM · ';

  const note =
    kind === 'refused' ? (
      <InlineNote tone="danger" role="alert">
        <span className="font-medium text-content-primary">
          The agent proposed Ready for review, and SpecFlow did not accept it:
        </span>
        <ul className="mt-1 grid list-disc gap-0.5 pl-5">
          <li>
            <span className={MONO}>src/auth/session.ts</span> changed, but the agent did not list it
            among its changes.
          </li>
          <li>
            <span className={MONO}>specs/active/single-sign-on/notes.md</span> has no document type.
            Give it a type or delete it.
          </li>
        </ul>
        <span className="mt-1 block">
          Continue lets the agent fix this in the same session. Take over to fix it yourself.
        </span>
      </InlineNote>
    ) : kind === 'continue-refused' ? (
      <InlineNote tone="attention" role="alert">
        <span className="font-medium text-content-primary">
          The agent cannot continue: 2 files changed since it stopped.
        </span>
        <PathList paths={['src/auth/refresh.ts', 'docs/notes.md']} />
        <span className="mt-1 block">
          SpecFlow never counts someone else’s edits as the agent’s work. Undo these changes, or
          commit them yourself (they become your commit, not the agent’s), then continue. Or take
          over and finish the step yourself.
        </span>
      </InlineNote>
    ) : (
      <InlineNote tone="attention">
        <span className="font-medium text-content-primary">
          The agent stopped without proposing a result.
        </span>{' '}
        Continue lets it go on in the same session. Take over to finish the step yourself.
      </InlineNote>
    );

  return (
    <NowBlock
      projection={agentImplementation()}
      headingId="now-mock"
      links={links}
      menu={<OperationsMenu />}
      positionLine={
        <>
          {line}
          <SessionLink />
        </>
      }
      summary={goal}
      note={
        <div className="grid gap-2">
          {note}
          <PartialWork />
        </div>
      }
      actions={
        <>
          <Button disabled={kind === 'continue-refused'}>Continue</Button>
          <Button variant="secondary">Take over</Button>
        </>
      }
    />
  );
}

function ConfirmPending() {
  return (
    <NowBlock
      projection={breakdownAwaitingConfirmation()}
      headingId="now-mock"
      links={links}
      showHandoff={false}
      menu={<OperationsMenu />}
      positionLine={
        <>
          Waiting for your confirmation · the agent finished Nov 12, 3:05 PM ·{' '}
          <SessionLink title="Break down single sign-on" />
        </>
      }
      summary={
        <Typography as="p" variant="body-md" className="text-content-primary">
          Split the agreed solution into tasks that can be done and reviewed one by one.
        </Typography>
      }
      note={
        <div className="grid gap-3">
          <QuoteBlock
            label={
              <>
                The agent proposes{' '}
                <span className="font-medium text-content-primary">
                  <LineIcon name="arrow-right" />
                  Tasks approved
                </span>{' '}
                · Claude · Sonnet 5
              </>
            }
          >
            Five tasks cover the token exchange, the cookie, refresh, the sign-in screen and the
            audit log. t-05 depends on t-02 and t-04. The audit log has no acceptance criteria in
            behaviour.md yet; I wrote them into its task.md.
          </QuoteBlock>
          <InlineNote tone="info">
            Confirming approves the 5 draft tasks (t-01 to t-05) and moves to Waiting for tasks.{' '}
            <TextLink>See Tasks</TextLink>
          </InlineNote>
        </div>
      }
      actions={
        <>
          <Button>Confirm</Button>
          <Button variant="secondary">Reject</Button>
        </>
      }
    />
  );
}

function TakenOver() {
  return (
    <NowBlock
      projection={takenOverImplementation()}
      headingId="now-mock"
      links={links}
      menu={<OperationsMenu />}
      positionLine="Attempt 3 · in progress since Nov 13, 1:15 PM · started by you · taken over from the agent"
      summary={goal}
      actions={<Button>Finish step</Button>}
    />
  );
}

/* ----------------------------------------------- the Overview's other sections, kept coherent */

/** The Overview's Sessions section with the agent's Session (the Sessions list row). */
function SessionsWithAgent({ unknown = false }: { readonly unknown?: boolean }) {
  return (
    <InformationList>
      <OperationalRow
        leading={<SessionProviderIcon providerId="claude" />}
        primary={unknown ? SESSION_TITLE : 'Break down single sign-on'}
        onPrimaryClick={noop}
        factsLayout="inline"
        compactFacts={
          unknown ? ['Nov 13', 'Claude Sonnet 5', '1 task'] : ['Nov 12', 'Claude Sonnet 5']
        }
        {...(unknown
          ? { supporting: { text: 'Session state unknown', textClassName: 'text-content-muted' } }
          : {})}
      />
    </InformationList>
  );
}

/* ----------------------------------------------------------------------------- dialogs */

function MockDialog({
  title,
  description,
  children,
  footer,
}: {
  readonly title: string;
  readonly description?: ReactNode;
  readonly children: ReactNode;
  readonly footer: ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent closeLabel="Close" onOpenAutoFocus={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-6">{children}</div>
        </DialogBody>
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type SessionMode = 'fresh' | 'continue' | 'independent' | 'not-chosen' | 'gone';

function SessionChoice({ mode }: { readonly mode: SessionMode }) {
  const [model, setModel] = useState({ modelId: 'sonnet-5', effort: 'high' });
  const [provider, setProvider] = useState('claude');
  const labelId = useId();

  if (mode === 'continue' || mode === 'gone') {
    return (
      <div className="grid gap-2">
        <Typography as="p" variant="label-sm">
          Session
        </Typography>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-md">
          <SessionProviderIcon providerId="claude" />
          <span>Continues</span>
          {mode === 'gone' ? (
            <span className="text-content-muted line-through">{SESSION_TITLE}</span>
          ) : (
            <TextLink>{SESSION_TITLE}</TextLink>
          )}
        </p>
        <Typography as="p" variant="body-sm" className="text-content-secondary">
          {mode === 'gone'
            ? 'This session no longer exists.'
            : 'Claude Sonnet 5 · high. The workflow continues the session that did Implementation before, so the agent keeps what it learned there. Its agent and model stay as they are.'}
        </Typography>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <Typography as="p" variant="label-sm" id={labelId}>
        New session
      </Typography>
      {mode === 'not-chosen' ? (
        <div className="grid gap-1">
          <p className="flex items-center gap-2 text-body-md text-content-muted">
            <span className="inline-flex size-4 rounded-full border border-dashed border-border-strong" />
            Agent and model not chosen
          </p>
        </div>
      ) : (
        <>
          <AgentPicker
            catalogue={codexClaudeCatalogue}
            providerId={provider}
            labelledBy={labelId}
            onSelect={setProvider}
          />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Typography as="span" variant="body-sm" className="text-content-secondary">
              Model
            </Typography>
            <ModelEffortPicker
              provider={claudeProvider}
              value={model}
              onChange={(modelId, effort) => setModel({ modelId, effort: effort ?? 'high' })}
            />
          </div>
          <Typography as="p" variant="body-sm" className="text-content-secondary">
            {mode === 'independent'
              ? 'Review is done independently: it always starts in a new session, never in the one that wrote the change. Preselected from the Reviewer agent settings.'
              : 'Preselected from the Implementer agent settings. Your choice applies to this attempt only.'}
          </Typography>
        </>
      )}
    </div>
  );
}

function CommitDisclosure() {
  return (
    <InlineNote tone="info" icon={GitCommitHorizontal}>
      When the agent finishes, SpecFlow commits its work on <Branch name={BRANCH} /> as one commit;
      changes of others are never included.
    </InlineNote>
  );
}

type Blocker = 'dirty' | 'no-agent' | 'session-unavailable';

function AskAgentBlocker({ kind }: { readonly kind: Blocker }) {
  switch (kind) {
    case 'dirty':
      return (
        <Alert tone="attention" title="Commit or undo these changes first">
          <div className="grid gap-2">
            <p>
              These files changed outside SpecFlow and are not committed. The agent starts from a
              committed checkout, so that everything that changes afterwards is its own work.
              (Documents and tasks SpecFlow saved itself do not block it.)
            </p>
            <PathList paths={['src/auth/refresh.ts', 'scratch-notes.txt', 'package.json']} />
            <CheckoutPath path="D:\repos\acme-portal\.nevo\worktrees\nevo-1" />
            <p>Commit them, or undo the ones you do not need, then check again.</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="secondary" leadingIcon="refresh">
                Check again
              </Button>
            </div>
          </div>
        </Alert>
      );
    case 'no-agent':
      return (
        <Alert tone="attention" title="No agent is chosen for Implementation">
          <div className="grid gap-2">
            <p>
              Implementation is done by the Implementer agent, and the project names no agent and
              model for it yet, so SpecFlow cannot tell which one to start.
            </p>
            <p>
              Choose them for Implementer in the project’s agent settings, then check again.{' '}
              <TextLink>Open agent settings</TextLink>
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="secondary" leadingIcon="refresh">
                Check again
              </Button>
            </div>
          </div>
        </Alert>
      );
    case 'session-unavailable':
      return (
        <Alert tone="attention" title="The session to continue is gone">
          <div className="grid gap-2">
            <p>
              The workflow continues the session that did Implementation before, and that session no
              longer exists. SpecFlow does not start a new one in its place, because this step is
              meant to build on what that session knows.
            </p>
            <p>
              Do the step yourself with Start step, or have the workflow changed so this step may
              start a new session.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="secondary" leadingIcon="refresh">
                Check again
              </Button>
            </div>
          </div>
        </Alert>
      );
  }
}

function AskAgentDialog({
  mode = 'fresh',
  blocker,
  step = 'Implementation',
}: {
  readonly mode?: SessionMode;
  readonly blocker?: Blocker;
  readonly step?: string;
}) {
  return (
    <MockDialog
      title={`Ask agent: ${step}`}
      description="The agent does this step of t-04 on its own: it reads the step, task.md and the task’s context, writes the documents and code the step needs, and proposes a result. Decisions that need you stay with you."
      footer={
        blocker ? (
          <>
            <Button variant="secondary">Cancel</Button>
            <Button leadingIcon={Bot} disabled>
              Ask agent
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary">Cancel</Button>
            <Button leadingIcon={Bot}>Ask agent</Button>
          </>
        )
      }
    >
      {blocker ? <AskAgentBlocker kind={blocker} /> : null}
      <SessionChoice mode={mode} />
      <CommitDisclosure />
    </MockDialog>
  );
}

function RejectDialog() {
  return (
    <MockDialog
      title="Reject the agent’s result"
      description="Breakdown goes back to ready to start, with your feedback as its hand-off. The agent’s proposal Tasks approved is not applied; the draft tasks and documents it wrote stay as they are."
      footer={
        <>
          <Button variant="secondary">Cancel</Button>
          <Button disabled>Reject</Button>
        </>
      }
    >
      <Field>
        <Field.Label>What should change (required)</Field.Label>
        <TextArea rows={4} aria-required />
        <Field.Description>
          The next attempt reads it first, whether you start it yourself or ask an agent.
        </Field.Description>
      </Field>
    </MockDialog>
  );
}

function TakeOverDialog() {
  return (
    <MockDialog
      title="Take over Implementation"
      description="The agent’s attempt ends as taken over, and your own attempt 3 starts. You then finish the step yourself."
      footer={
        <>
          <Button variant="secondary">Cancel</Button>
          <Button>Take over</Button>
        </>
      }
    >
      <Group
        heading="The agent’s work stays"
        explanation="Nothing is undone. These files stay as the agent left them, uncommitted until you commit them; finishing the step does not commit them, and Close lists them until they are committed."
      >
        <PathList paths={AGENT_FILES} />
      </Group>
      <Typography as="p" variant="body-sm" className="text-content-secondary">
        The session <TextLink>{SESSION_TITLE}</TextLink> stays open to read; it no longer works on
        this step.
      </Typography>
    </MockDialog>
  );
}

/* ---------------------------------------------------------------------- Task history */

function HistoryList() {
  const item = (
    title: ReactNode,
    lines: ReactNode,
    meta: string,
    tone: 'neutral' | 'info' = 'neutral',
  ) => (
    <Timeline.Item>
      <Timeline.Marker tone={tone} />
      <Timeline.Content
        title={
          <span role="heading" aria-level={3}>
            {title}
          </span>
        }
      >
        <div className="grid min-w-0 gap-1 [overflow-wrap:anywhere]">
          {lines}
          <Typography as="p" variant="body-sm" className="text-content-muted">
            {meta}
          </Typography>
          <div>
            <Button size="sm" variant="ghost">
              Attempt details
            </Button>
          </div>
        </div>
      </Timeline.Content>
    </Timeline.Item>
  );

  return (
    <Timeline size="md">
      {item(
        'Implementation',
        <Typography as="p" variant="body-sm" className="text-status-info">
          In progress
        </Typography>,
        'Nov 13, 1:15 PM · you · Attempt 3',
        'info',
      )}
      {item(
        'Implementation',
        <>
          <Typography as="p" variant="body-sm" className="text-content-primary">
            <LineIcon name="undo" />
            Taken over by you
          </Typography>
          <Typography as="p" variant="body-sm" className="text-content-secondary">
            The agent stopped without a result at 1:10 PM. Its work, kept and not committed:
          </Typography>
          <ul className="grid gap-0.5 text-body-sm">
            <li>
              Documents: <TextLink>task.md</TextLink> saved, <TextLink>screens.md</TextLink> created
            </li>
            <li>Tasks: none</li>
            <li>
              Files: <span className={MONO}>src/auth/refresh.ts</span>,{' '}
              <span className={MONO}>src/auth/state.ts</span>,{' '}
              <span className={MONO}>src/auth/refresh.test.ts</span>
            </li>
          </ul>
          <Typography as="p" variant="body-sm" className="text-content-secondary">
            Session <SessionLink />
          </Typography>
        </>,
        'Nov 13, 12:52 PM – 1:15 PM · Claude · Sonnet 5 · Attempt 2',
      )}
      {item(
        'Review',
        <>
          <Typography as="p" variant="body-sm" className="text-content-primary">
            <LineIcon name="arrow-right" />
            Changes requested
          </Typography>
          <Typography as="p" variant="body-sm">
            The refresh path drops the original return URL when the cookie expires mid-request.
          </Typography>
        </>,
        'Nov 13, 12:40 PM · dominik · Attempt 1',
      )}
      {item(
        'Implementation',
        <Typography as="p" variant="body-sm" className="text-content-primary">
          <LineIcon name="arrow-right" />
          Ready for review
        </Typography>,
        'Nov 13, 11:15 AM · dominik · Attempt 1',
      )}
    </Timeline>
  );
}

/* --------------------------------------------------------------------------- screen */

/** The real screen behind each state: the Full Task page, or the Overview. */
function screenOf(state: AskAgentState) {
  if (state === 'close-uncommitted') {
    return 'close-integrates' as const;
  }

  return state === 'confirm-pending' ||
    state === 'confirm-reject' ||
    state === 'outcome-unknown-other'
    ? ('waiting' as const)
    : ('rework' as const);
}

function nowOf(state: AskAgentState): ReactNode {
  switch (state) {
    case 'entry-a-two-buttons':
    case 'dialog-fresh':
    case 'dialog-continue':
    case 'dialog-dirty':
    case 'dialog-no-agent':
    case 'dialog-session-unavailable':
      return <EntryTwoButtons />;
    case 'entry-b-split':
      return <EntrySplit />;
    case 'dialog-independent':
    case 'finished-committed':
      return <FinishedCommitted />;
    case 'running':
    case 'stopping':
    case 'return-requested':
    case 'outcome-unknown':
      return <AgentAttempt kind={state} />;
    case 'outcome-unknown-other':
      return <OtherSubjectBlocked />;
    case 'finished-commit-failed':
      return <FinishedCommitFailed />;
    case 'ended-without-finish':
    case 'take-over':
      return <Unresolved kind="ended" />;
    case 'proposal-refused':
      return <Unresolved kind="refused" />;
    case 'continue-refused':
      return <Unresolved kind="continue-refused" />;
    case 'confirm-pending':
    case 'confirm-reject':
      return <ConfirmPending />;
    case 'taken-over-history':
      return <TakenOver />;
    case 'close-uncommitted':
      return null;
  }
}

function dialogOf(state: AskAgentState): ReactNode {
  switch (state) {
    case 'dialog-fresh':
      return <AskAgentDialog />;
    case 'dialog-continue':
      return <AskAgentDialog mode="continue" />;
    case 'dialog-independent':
      return <AskAgentDialog mode="independent" step="Review" />;
    case 'dialog-dirty':
      return <AskAgentDialog blocker="dirty" />;
    case 'dialog-no-agent':
      return <AskAgentDialog blocker="no-agent" mode="not-chosen" />;
    case 'dialog-session-unavailable':
      return <AskAgentDialog blocker="session-unavailable" mode="gone" />;
    case 'confirm-reject':
      return <RejectDialog />;
    case 'take-over':
      return <TakeOverDialog />;
    case 'close-uncommitted':
      return <CloseUncommittedDialog />;
    default:
      return null;
  }
}

const findNoSessions = findDeepest('This specification has no sessions yet.');
const findTaskCounts = findDeepest('Needs approval', 'Done');

export function AskAgentMock({ state }: { readonly state: AskAgentState }) {
  const now = nowOf(state);
  const dialog = dialogOf(state);
  const confirmation = state === 'confirm-pending' || state === 'confirm-reject';

  return (
    <>
      <WorkflowExecutionFixture scenario={screenOf(state)} />
      {now ? <Replace find={findNow}>{now}</Replace> : null}
      {confirmation ? (
        <>
          <Replace find={findNoSessions}>
            <SessionsWithAgent />
          </Replace>
          <Replace find={findTaskCounts}>
            <p className="px-3 py-3 text-body-sm text-content-primary">Needs approval 5</p>
          </Replace>
        </>
      ) : null}
      {state === 'outcome-unknown-other' ? (
        <Replace find={findNoSessions}>
          <SessionsWithAgent unknown />
        </Replace>
      ) : null}
      {state === 'taken-over-history' ? (
        <Replace find={findHistoryList}>
          <HistoryList />
        </Replace>
      ) : null}
      {dialog ? (
        <StoryLocalization>
          <DelayedDialog>{dialog}</DelayedDialog>
        </StoryLocalization>
      ) : null}
    </>
  );
}

/** Opens the dialog once the screen behind it rendered (the routed page loads its data first). */
function DelayedDialog({ children }: { readonly children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useState(() => window.setTimeout(() => setReady(true), 1200));

  return ready ? <>{children}</> : null;
}
