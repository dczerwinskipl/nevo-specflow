import { useState, type ReactNode } from 'react';
import { Bot, ChevronDown, GitCommitHorizontal } from 'lucide-react';
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
import { ModelEffortPicker } from '../../features/sessions/managed/ModelEffortPicker';
import { SessionProviderIcon } from '../../features/sessions/shared/SessionProviderIcon';
import { StoryLocalization } from '../../i18n/StoryLocalization';
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
  CheckoutPath,
  DiscardWarning,
  Goal,
  Group,
  LineIcon,
  MONO,
  PathList,
  QuoteBlock,
  Replace,
  TextLink,
  findHistoryList,
  findNow,
} from './MockParts.stories-support';

/*
 * PRESENTATION MOCK ONLY (design validation for docs/product/specflow/ui/workflow-execution.md,
 * "Ask agent"). The real routed Full Task page or Specification Overview, with only the Now block
 * (or the Task history list) replaced by the mock's, and the mock's dialogs open over it. Static
 * data, no commands; no interaction tests.
 */

export type AskAgentState =
  | 'entry-a-two-buttons'
  | 'entry-b-split'
  | 'dialog-fresh'
  | 'dialog-continue'
  | 'dialog-independent'
  | 'dialog-dirty'
  | 'dialog-no-agent'
  | 'dialog-pairing-code'
  | 'running'
  | 'stopping'
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
function OperationsMenu({ extra = [] }: { readonly extra?: readonly string[] }) {
  return (
    <NowOperationsMenu
      operations={[
        ...extra.map((label) => ({ id: label, label, onSelect: noop })),
        { id: 'return', label: 'Return to an earlier step', onSelect: noop },
      ]}
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
      actions={
        <>
          <Button>Start step</Button>
          <Button variant="secondary" leadingIcon={Bot}>
            Ask agent
          </Button>
        </>
      }
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

function Running({ stopping = false }: { readonly stopping?: boolean }) {
  return (
    <NowBlock
      projection={agentImplementation()}
      headingId="now-mock"
      links={links}
      menu={<OperationsMenu />}
      positionLine={
        <>
          {stopping
            ? 'Attempt 2 · stopping the agent · '
            : 'Attempt 2 · agent working since 12:52 · '}
          <SessionLink />
        </>
      }
      summary={goal}
      note={
        stopping ? (
          <InlineNote tone="info" icon="loader">
            Asked the agent to stop. Implementation stays locked until SpecFlow sees its process has
            ended; then you can continue, take over or return.
          </InlineNote>
        ) : undefined
      }
      actions={
        stopping ? (
          <Button variant="secondary" disabled aria-busy>
            Stopping…
          </Button>
        ) : (
          <Button variant="secondary" leadingIcon="circle-pause">
            Stop agent
          </Button>
        )
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
      summary={<Goal text="Check the change against task.md and record what was verified." />}
      note={
        <InlineNote tone="info" icon={GitCommitHorizontal}>
          The agent finished Implementation. Committed <span className={MONO}>3f2a9c1</span> on{' '}
          <span className={MONO}>{BRANCH}</span>: 2 documents and 3 files.{' '}
          <TextLink>Show commit</TextLink>
        </InlineNote>
      }
      actions={
        <>
          <Button>Start step</Button>
          <Button variant="secondary" leadingIcon={Bot}>
            Ask agent
          </Button>
        </>
      }
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
      summary={<Goal text="Check the change against task.md and record what was verified." />}
      note={
        <InlineNote tone="attention" role="alert">
          <span className="font-medium text-content-primary">
            Implementation is finished. The commit failed (
            <span className={MONO}>COMMIT_HOOK_FAILED</span>).
          </span>{' '}
          These 5 files stay uncommitted on <span className={MONO}>{BRANCH}</span>, and Close lists
          them until they are committed.
          <PathList
            paths={[
              'specs/active/single-sign-on/tasks/t-04/task.md',
              'specs/active/single-sign-on/tasks/t-04/screens.md',
              'src/auth/refresh.ts',
              'src/auth/state.ts',
              'src/auth/refresh.test.ts',
            ]}
          />
          <span className="mt-1 block">
            <TextLink>Retry commit</TextLink>
          </span>
        </InlineNote>
      }
      actions={
        <>
          <Button>Start step</Button>
          <Button variant="secondary" leadingIcon={Bot}>
            Ask agent
          </Button>
        </>
      }
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
  const line = {
    ended: 'Attempt 2 · the agent stopped without finishing · ',
    refused: 'Attempt 2 · the agent’s result was not accepted · ',
    'continue-refused': 'Attempt 2 · the agent stopped without finishing · ',
  }[kind];

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
          The agent cannot continue: 2 files changed since its last turn.
        </span>
        <PathList paths={['src/auth/refresh.ts', 'docs/notes.md']} />
        <span className="mt-1 block">
          SpecFlow never counts someone else’s edits as the agent’s work. Commit or undo these
          changes, then continue. Or take over and finish the step yourself.
        </span>
      </InlineNote>
    ) : (
      <InlineNote tone="attention">
        <span className="font-medium text-content-primary">
          The agent’s turn ended without a result.
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
          Waiting for your confirmation · the agent finished at 14:05 ·{' '}
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
            Confirming approves 5 draft tasks (t-01 to t-05) and moves to Waiting for tasks.{' '}
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
      positionLine="Attempt 3 · in progress since 12:31 · started by you · taken over from the agent"
      summary={goal}
      actions={<Button>Finish step</Button>}
    />
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
      <DialogContent closeLabel="Close">
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

type SessionMode = 'fresh' | 'continue' | 'independent';

function SessionChoice({ mode }: { readonly mode: SessionMode }) {
  const [model, setModel] = useState({ modelId: 'sonnet-5', effort: 'high' });

  return (
    <div className="grid gap-2">
      <Typography as="p" variant="label-sm">
        Session
      </Typography>
      {mode === 'continue' ? (
        <div className="grid gap-1">
          <p className="flex items-center gap-2 text-body-md">
            <SessionProviderIcon providerId="claude" />
            <span>
              Continues <TextLink>{SESSION_TITLE}</TextLink>
            </span>
          </p>
          <Typography as="p" variant="body-sm" className="text-content-secondary">
            Claude Sonnet 5 · high. The workflow continues the session that did Implementation
            before, so the agent keeps what it learned. Its model stays as it is.
          </Typography>
        </div>
      ) : (
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="flex items-center gap-2 text-body-md">
              <SessionProviderIcon providerId="claude" />
              New session with Claude
            </p>
            <ModelEffortPicker
              provider={claudeProvider}
              value={model}
              onChange={(modelId, effort) => setModel({ modelId, effort: effort ?? 'high' })}
            />
          </div>
          <Typography as="p" variant="body-sm" className="text-content-secondary">
            {mode === 'independent'
              ? 'Review is done independently: it always starts in a new session, never in the one that wrote the change.'
              : 'Implementer agents use Claude. You can choose another model for this session.'}
          </Typography>
        </div>
      )}
    </div>
  );
}

function CommitDisclosure() {
  return (
    <InlineNote tone="info" icon={GitCommitHorizontal}>
      When the agent finishes, SpecFlow commits its work on <span className={MONO}>{BRANCH}</span>{' '}
      as one commit; changes of others are never included.
    </InlineNote>
  );
}

type Blocker = 'dirty' | 'no-agent' | 'pairing-code';

function AskAgentBlocker({ kind }: { readonly kind: Blocker }) {
  if (kind === 'dirty') {
    return (
      <Alert tone="attention" title="Commit or undo these changes first">
        <div className="grid gap-2">
          <p>
            The agent starts from a committed checkout, so that everything that changes afterwards
            is its own work. These files have uncommitted changes:
          </p>
          <PathList
            paths={['src/auth/refresh.ts', 'scratch-notes.txt', 'package.json']}
            note={(path) => (path === 'src/auth/refresh.ts' ? '(changed by you)' : undefined)}
          />
          <CheckoutPath path="D:\repos\acme-portal\.nevo\worktrees\nevo-1" />
          <p>Commit them, or undo the ones you do not need, then check again.</p>
        </div>
      </Alert>
    );
  }

  if (kind === 'no-agent') {
    return (
      <Alert tone="attention" title="No agent is chosen for Implementation">
        <div className="grid gap-2">
          <p>
            Implementation is done by the Implementer agent role, and the project names no provider
            and model for it yet, so SpecFlow cannot tell which agent to start.
          </p>
          <p>
            Choose them for Implementer in the project’s agent settings, then check again.{' '}
            <TextLink>Open agent settings</TextLink>
          </p>
        </div>
      </Alert>
    );
  }

  return (
    <Alert tone="attention" title="Agents are paused while a pairing code is waiting">
      <div className="grid gap-2">
        <p>
          The Runtime was started with <span className={MONO}>--pair</span> and wrote a one-time
          pairing code to a file on its machine. No agent runs while that code can be read, so an
          agent can never use it to pair itself.
        </p>
        <p>
          Pair a device with the code (on that device: Pair this device, Enter a code), or restart
          the Runtime without <span className={MONO}>--pair</span>.
        </p>
      </div>
    </Alert>
  );
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
      description={`The agent does this step of t-04 on its own: it reads the step, task.md and the task’s context, writes the documents and code the step needs, and proposes a result. Decisions that need you stay with you.`}
      footer={
        <>
          <Button variant="secondary">Cancel</Button>
          {blocker ? <Button variant="secondary">Check again</Button> : null}
          <Button leadingIcon={Bot} disabled={blocker !== undefined}>
            Ask agent
          </Button>
        </>
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
      description="Breakdown stays open and the agent’s proposal Tasks approved is not applied. The draft tasks and documents it wrote stay as they are."
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
          This becomes the step’s hand-off: the next attempt, yours or an agent’s, reads it first.
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
        explanation="Nothing is undone. These stay as the agent left them, uncommitted until you finish or commit them:"
      >
        <PathList
          paths={[
            'specs/active/single-sign-on/tasks/t-04/task.md',
            'specs/active/single-sign-on/tasks/t-04/screens.md',
            'src/auth/refresh.ts',
            'src/auth/state.ts',
            'src/auth/refresh.test.ts',
          ]}
        />
      </Group>
      <Typography as="p" variant="body-sm" className="text-content-secondary">
        The session <TextLink>{SESSION_TITLE}</TextLink> stays open to read; it no longer works on
        this step.
      </Typography>
    </MockDialog>
  );
}

/** D16: the Close preview's one Uncommitted changes group, by kind, each with its remedy. */
function CloseUncommittedDialog() {
  return (
    <MockDialog
      title="Close Single sign-on"
      description="Single sign-on cannot close yet: 7 files are not committed."
      footer={
        <>
          <Button variant="secondary">Dismiss</Button>
          <Button>Check again</Button>
        </>
      }
    >
      <Group
        heading="Uncommitted changes · 7"
        explanation="Closing starts from a committed checkout, and SpecFlow never discards work. Each kind is committed its own way:"
      >
        <div className="grid gap-5 pt-1">
          <Group
            level={4}
            heading="Agent work whose commit failed · 3"
            explanation={
              <>
                Implementation of t-04 finished, but its commit failed (
                <span className={MONO}>COMMIT_HOOK_FAILED</span>).
              </>
            }
          >
            <PathList
              paths={['src/auth/refresh.ts', 'src/auth/state.ts', 'src/auth/refresh.test.ts']}
            />
            <div>
              <Button size="sm" variant="secondary" leadingIcon={GitCommitHorizontal}>
                Retry commit
              </Button>
            </div>
          </Group>
          <Group
            level={4}
            heading="Saved in SpecFlow, not committed yet · 2"
            explanation="Documents and task changes SpecFlow saved; commit them from Documents."
          >
            <PathList
              paths={[
                'specs/active/single-sign-on/overview.md',
                'specs/active/single-sign-on/tasks/t-05/task.md',
              ]}
            />
            <div>
              <TextLink>Open Documents</TextLink>
            </div>
          </Group>
          <Group
            level={4}
            heading="Changed outside SpecFlow · 2"
            explanation="SpecFlow did not write these. Commit them with Git in this checkout, or move them elsewhere."
          >
            <PathList paths={['scratch-notes.txt', 'package.json']} />
            <CheckoutPath path="D:\repos\acme-portal\.nevo\worktrees\nevo-1" />
            <DiscardWarning />
          </Group>
        </div>
      </Group>
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
        'Nov 13, 12:31 PM · you · Attempt 3',
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
            Agent work kept:
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
            2 turns in <SessionLink /> · stopped by you at 12:24
          </Typography>
        </>,
        'Nov 13, 12:31 PM · Claude · Sonnet 5 · Attempt 2',
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

/** The real screen behind each state: the Full Task page, or the Overview for its states. */
function screenOf(state: AskAgentState) {
  if (state === 'confirm-pending' || state === 'confirm-reject') {
    return 'waiting' as const;
  }

  if (state === 'close-uncommitted') {
    return 'close-integrates' as const;
  }

  return 'rework' as const;
}

function nowOf(state: AskAgentState): ReactNode {
  switch (state) {
    case 'entry-a-two-buttons':
    case 'dialog-fresh':
    case 'dialog-continue':
    case 'dialog-dirty':
    case 'dialog-no-agent':
    case 'dialog-pairing-code':
      return <EntryTwoButtons />;
    case 'entry-b-split':
      return <EntrySplit />;
    case 'dialog-independent':
    case 'finished-committed':
      return <FinishedCommitted />;
    case 'running':
      return <Running />;
    case 'stopping':
      return <Running stopping />;
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
      return <AskAgentDialog blocker="no-agent" />;
    case 'dialog-pairing-code':
      return <AskAgentDialog blocker="pairing-code" />;
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

export function AskAgentMock({ state }: { readonly state: AskAgentState }) {
  const now = nowOf(state);
  const dialog = dialogOf(state);

  return (
    <>
      <WorkflowExecutionFixture scenario={screenOf(state)} />
      {now ? <Replace find={findNow}>{now}</Replace> : null}
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
