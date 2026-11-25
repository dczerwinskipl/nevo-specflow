import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Bot, GitCommitHorizontal, HardDrive, UserRound } from 'lucide-react';
import {
  Alert,
  Button,
  Checkbox,
  Collapsible,
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
  TextArea,
  Typography,
  cn,
} from '@nevo/ui';
import { WorkflowExecutionFixture } from '../../features/tasks/execution/ProjectWorkflowExecution.stories-support';
import { pathParts } from '../../features/tasks/execution/agent/AttemptChanges';
import { InlineAction } from '../../features/tasks/execution/InlineAction';
import { StoryLocalization } from '../../i18n/StoryLocalization';
import { AttentionSection } from '../../features/specs/workspace/sections/AttentionSection';
import { WorkspaceSection } from '../../shared/workspace-section';

/*
 * PRESENTATION MOCK ONLY (owner acceptance of the Git state of a Specification, PR #169). The real
 * routed Specification Overview of a project Runtime, with only its Repository section (the
 * section the demo read model rendered, `features/git`) replaced by the mock's, and the mock's
 * Commit dialog open over it. Static data, no commands, no interaction tests.
 *
 * Reused as they are: the Overview, its Now block (with Retry commit), the section frame
 * (WorkspaceSection), the changed-file rows of Activity history (the DS Collapsible without its
 * leading chevron, the file name then its folder in the muted tone, `pathParts`), the Committed
 * note's wording and icon, the Finish step dialog's "why the button is disabled" footer note.
 */

const BRANCH = 'nevo-1/single-sign-on';
const DIR = 'specs/active/single-sign-on';
const noop = () => undefined;

/** Who changed a file, as far as SpecFlow knows it. */
type Origin = 'agent-taken-over' | 'agent-commit-failed' | 'owner' | 'outside';

interface FileGroup {
  readonly origin: Origin;
  readonly paths: readonly string[];
}

/** What waits for the files to be committed, named as the button it blocks. */
interface Blocker {
  readonly action: ReactNode;
  readonly why: ReactNode;
  readonly todo: ReactNode;
}

interface WidgetData {
  readonly read: 'ok' | 'unknown';
  readonly groups: readonly FileGroup[];
  readonly blocker?: Blocker;
  /** Files only SpecFlow saved: nothing waits for them yet; say what will. */
  readonly calm?: ReactNode;
  readonly committed?: { readonly sha: string; readonly count: number };
}

const doc = (name: string) => `${DIR}/${name}`;

const longPaths = [
  doc(
    'tasks/t-04-return-users-to-where-they-were/attachments/screens/narrow-375/sign-in-return.png',
  ),
  'packages/identity/src/features/sign-in/return-to-project/restore-last-open-project-location.ts',
  'packages/identity/src/features/sign-in/return-to-project/restore-last-open-project-location.test.ts',
];

const manyPaths: readonly string[] = [
  ...longPaths,
  ...Array.from({ length: 31 }, (_, index) =>
    index % 3 === 0
      ? doc(`tasks/t-${String(index + 10).padStart(2, '0')}/task.md`)
      : index % 3 === 1
        ? `packages/identity/src/session/cookie-${index}.ts`
        : `docs/reference/identity/claims/claim-${index}.md`,
  ),
];

/** Each story's Overview scenario, Now and Git state. */
export type GitStateCase =
  | 'clean'
  | 'committed-just-now'
  | 'saved-in-specflow'
  | 'changed-outside'
  | 'taken-over'
  | 'close-waits'
  | 'commit-failed'
  | 'many-files'
  | 'unknown'
  | 'git-off'
  | 'dialog-taken-over'
  | 'dialog-many-files'
  | 'dialog-nothing-chosen'
  | 'dialog-agent-commit-failed'
  | 'dialog-committing'
  | 'dialog-refused';

const runWithAgentBlocked: Blocker = {
  action: <strong className="font-medium">Run with agent cannot start on any task</strong>,
  why: 'while these files are not committed: the agent starts from a committed checkout, so that everything that changes afterwards is its own work.',
  todo: 'Commit them, or undo the ones you do not need.',
};

const data: Record<Exclude<GitStateCase, `dialog-${string}` | 'git-off'>, WidgetData> = {
  clean: { read: 'ok', groups: [] },
  'committed-just-now': { read: 'ok', groups: [], committed: { sha: 'f4bf4076', count: 3 } },
  'saved-in-specflow': {
    read: 'ok',
    groups: [{ origin: 'owner', paths: [doc('ux.md'), doc('requirements.md')] }],
    calm: 'Nothing waits for them now. Close specification will wait until they are committed.',
  },
  'changed-outside': {
    read: 'ok',
    groups: [{ origin: 'outside', paths: [doc('overview.md'), doc('decisions.md')] }],
    blocker: runWithAgentBlocked,
  },
  'taken-over': {
    read: 'ok',
    groups: [
      {
        origin: 'agent-taken-over',
        paths: [doc('architecture.md'), doc('decisions.md'), doc('tasks/t-05/task.md')],
      },
      { origin: 'owner', paths: [doc('ux.md')] },
    ],
    blocker: runWithAgentBlocked,
  },
  'close-waits': {
    read: 'ok',
    groups: [{ origin: 'owner', paths: [doc('ux.md'), doc('requirements.md')] }],
    blocker: {
      action: <strong className="font-medium">Close specification waits for these files</strong>,
      why: 'because the project commits documents only when you say so, and Close keeps nothing uncommitted.',
      todo: 'Commit them, then Close.',
    },
  },
  'commit-failed': {
    read: 'ok',
    groups: [
      {
        origin: 'agent-commit-failed',
        paths: [doc('tasks/t-01/task.md'), doc('tasks/t-02/task.md')],
      },
    ],
    blocker: {
      action: <strong className="font-medium">Confirm and Reject wait for the agent’s work</strong>,
      why: 'because its commit failed (the branch is protected).',
      todo: 'Fix the cause and use Retry commit in Now to keep it the agent’s commit, or commit it here as yours.',
    },
  },
  'many-files': {
    read: 'ok',
    groups: [
      { origin: 'owner', paths: [doc('overview.md')] },
      { origin: 'outside', paths: manyPaths },
    ],
    blocker: runWithAgentBlocked,
  },
  unknown: { read: 'unknown', groups: [] },
};

const dialogBase: Record<`dialog-${string}`, Exclude<GitStateCase, `dialog-${string}`>> = {
  'dialog-taken-over': 'taken-over',
  'dialog-many-files': 'many-files',
  'dialog-nothing-chosen': 'changed-outside',
  'dialog-agent-commit-failed': 'commit-failed',
  'dialog-committing': 'taken-over',
  'dialog-refused': 'taken-over',
};

/** The routed Overview each case sits on (its Now is the real one). */
function scenarioOf(base: Exclude<GitStateCase, `dialog-${string}`>) {
  if (base === 'clean' || base === 'committed-just-now') {
    return { scenario: 'attempt-confirmation', confirmationCommit: 'committed' } as const;
  }

  if (base === 'commit-failed') {
    return { scenario: 'attempt-confirmation', confirmationCommit: 'failed' } as const;
  }

  if (base === 'close-waits') {
    return { scenario: 'close-engine-uncommitted' } as const;
  }

  return { scenario: 'waiting' } as const;
}

const origins: Record<
  Origin,
  { readonly icon: typeof Bot; readonly label: string; readonly note: string }
> = {
  'agent-taken-over': {
    icon: Bot,
    label: 'Agent’s work you took over · Breakdown',
    note: 'The agent wrote these in Breakdown, attempt 1, before you took the step over. Committing them makes them your commit.',
  },
  'agent-commit-failed': {
    icon: Bot,
    label: 'Agent’s work, its commit failed · Breakdown',
    note: 'Retry commit in Now commits these as the agent’s work. Committing them here makes them your commit instead.',
  },
  owner: {
    icon: UserRound,
    label: 'Saved by you in SpecFlow',
    note: 'Documents you saved while the project commits them only when you say so.',
  },
  outside: {
    icon: HardDrive,
    label: 'Changed outside SpecFlow',
    note: 'Changed on disk by an editor, a terminal or a script. SpecFlow cannot tell who.',
  },
};

/** Inserts `children` in place of the first element `find` returns (hidden), inside the real screen. */
function Replace({
  find,
  children,
  hideParent = false,
}: {
  readonly find: () => HTMLElement | null | undefined;
  readonly children: ReactNode;
  /** Hide the section's wrapper too (its divider), replacing it with nothing. */
  readonly hideParent?: boolean;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let created: HTMLElement | null = null;
    const tick = () => {
      const target = find();
      if (!target) {
        return;
      }

      target.style.display = 'none';
      if (hideParent && target.parentElement) {
        target.parentElement.style.display = 'none';

        return;
      }

      if (!created || !created.isConnected || created.nextElementSibling !== target) {
        created?.remove();
        created = document.createElement('div');
        created.setAttribute('data-mock-replacement', '');
        target.parentElement?.insertBefore(created, target);
        setHost(created);
      }
    };

    tick();
    const timer = window.setInterval(tick, 150);

    return () => {
      window.clearInterval(timer);
      created?.remove();
    };
  }, [find, hideParent]);

  return host ? createPortal(<StoryLocalization>{children}</StoryLocalization>, host) : null;
}

/**
 * The Repository section where the read model renders it; where it does not (the project
 * Runtime's `not_implemented`), a placeholder at its place in the `context` slot: after Documents,
 * in a wrapper with the divider every later section has.
 */
const findRepository = () => {
  const existing = document.querySelector<HTMLElement>(
    'section[aria-labelledby="repo-heading"], section[data-mock-repository-slot]',
  );
  if (existing) {
    return existing;
  }

  const documents = Array.from(document.querySelectorAll<HTMLElement>('h2, h3')).find(
    (heading) =>
      heading.textContent?.trim() === 'Documents' && !heading.closest('[data-mock-replacement]'),
  );
  const outlet = documents?.closest('section')?.parentElement?.parentElement;
  if (!outlet) {
    return null;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'border-t border-border-default py-4 @min-[40rem]/work:py-5';
  const slot = document.createElement('section');
  slot.setAttribute('data-mock-repository-slot', '');
  wrapper.append(slot);
  outlet.append(wrapper);

  return slot;
};

/**
 * Requires attention's place under Now (the section appears only with items): a wrapper after the
 * Now block's with the divider, column and narrow-band classes the Overview gives it.
 */
const findAttention = () => {
  const existing = document.querySelector<HTMLElement>('[data-mock-attention-slot]');
  if (existing) {
    return existing;
  }

  const now = Array.from(document.querySelectorAll<HTMLElement>('[data-workflow-now]')).find(
    (element) => !element.closest('[data-mock-replacement]'),
  );
  let nowWrapper = now?.parentElement ?? null;
  while (nowWrapper && !nowWrapper.className.includes('pt-3')) {
    nowWrapper = nowWrapper.parentElement;
  }

  if (!nowWrapper) {
    return null;
  }

  const wrapper = document.createElement('div');
  wrapper.className = [
    'border-t border-border-default py-4 @min-[40rem]/work:py-5 @max-[40rem]/app-content:border-t-0',
    nowWrapper.className.includes('col-start-1') ? 'col-start-1 min-w-0' : '',
  ].join(' ');
  const slot = document.createElement('div');
  slot.setAttribute('data-mock-attention-slot', '');
  wrapper.append(slot);
  nowWrapper.after(wrapper);

  return slot;
};

/** The Git attention entry (the git module's own contribution point), with Commit as its action. */
function attentionOf(base: Exclude<GitStateCase, `dialog-${string}`>) {
  const files = base === 'many-files' ? 35 : base === 'taken-over' ? 4 : 2;
  const reason =
    base === 'close-waits'
      ? 'Close specification waits for them'
      : base === 'changed-outside' || base === 'taken-over' || base === 'many-files'
        ? 'Run with agent cannot start on any task'
        : undefined;
  if (!reason) {
    return [];
  }

  return [
    {
      renderKey: 'git',
      icon: 'branch' as const,
      item: {
        id: 'git-uncommitted',
        kind: 'git' as const,
        title: `${count(files)} not committed`,
        reason,
        actionLabel: 'Commit changes…',
      },
      facts: ['Repository', BRANCH],
      tone: 'attention' as const,
      reasonIcon: 'triangle-alert' as const,
      action: { label: 'Commit changes…', onClick: noop },
    },
  ];
}

const MONO_BRANCH = 'font-mono whitespace-nowrap text-content-primary';

function count(paths: number) {
  return paths === 1 ? '1 file' : `${paths} files`;
}

/** One changed path: the file name, then its folder in the muted tone (Activity history's row). */
function PathLine({ path }: { readonly path: string }) {
  const { name, folder } = pathParts(path, DIR);

  return (
    <li className="flex min-h-6 min-w-0 items-center gap-2" title={path}>
      <span className="max-w-full shrink-0 text-content-primary [overflow-wrap:anywhere]">
        {name}
      </span>
      {folder ? <span className="min-w-0 truncate text-content-muted">{folder}</span> : null}
    </li>
  );
}

/** A group of changed files by who changed them: Activity history's change row, open when short. */
function OriginRow({ group, open }: { readonly group: FileGroup; readonly open: boolean }) {
  const origin = origins[group.origin];
  const OriginIcon = origin.icon;

  return (
    <Collapsible
      showIndicator={false}
      defaultExpanded={open}
      className="-mx-control-padding-compact"
      data-origin={group.origin}
    >
      <Collapsible.Trigger className="text-body-sm">
        <span className="flex min-w-0 items-center gap-2">
          <OriginIcon aria-hidden="true" className="size-4 shrink-0 text-content-muted" />
          <span className="min-w-0 flex-1 text-content-primary">
            {origin.label}
            <span className="text-content-muted"> · {count(group.paths.length)}</span>
          </span>
          <Icon
            name="chevron-down"
            size="sm"
            aria-hidden="true"
            className="shrink-0 text-content-muted transition-transform group-data-[expanded]/collapsible:rotate-180 motion-reduce:transition-none"
          />
        </span>
      </Collapsible.Trigger>
      <Collapsible.Content className="grid gap-1 pl-8 pr-control-padding-compact">
        <Typography as="p" variant="body-sm" className="text-content-secondary">
          {origin.note}
        </Typography>
        <ul className="grid text-body-sm">
          {group.paths.map((path) => (
            <PathLine key={path} path={path} />
          ))}
        </ul>
      </Collapsible.Content>
    </Collapsible>
  );
}

/** The Repository section of the Overview: branch, committed or not, by whom, what waits, Commit. */
export function GitStateSection({
  state,
  onCommit = noop,
}: {
  readonly state: WidgetData;
  readonly onCommit?: () => void;
}) {
  const total = state.groups.reduce((sum, group) => sum + group.paths.length, 0);
  const openRows = total <= 5;

  return (
    <WorkspaceSection aria-labelledby="git-state-heading" data-git-state="">
      <WorkspaceSection.Header id="git-state-heading" title="Repository" icon="branch" />
      <div className="grid gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-body-sm">
          <span className={MONO_BRANCH}>{BRANCH}</span>
          <span className="text-content-muted">from main</span>
        </div>

        {state.read === 'unknown' ? (
          <InlineNote tone="attention" role="status">
            <strong className="font-medium">
              SpecFlow could not read Git in this checkout just now
            </strong>{' '}
            (Git did not answer within 10 seconds). Whether files are uncommitted is unknown, so
            nothing can be committed from here until it reads again.
            <div className="mt-2">
              <Button size="sm" variant="secondary" leadingIcon="refresh" onClick={noop}>
                Check again
              </Button>
            </div>
          </InlineNote>
        ) : (
          <Typography
            as="p"
            variant="body-sm"
            className="flex flex-wrap items-center gap-x-2 gap-y-1"
          >
            {total === 0 ? (
              <span className="inline-flex items-center gap-1.5 text-content-primary">
                <Icon
                  name="circle-check"
                  size="sm"
                  aria-hidden="true"
                  className="text-status-success"
                />
                Everything is committed
              </span>
            ) : (
              <span className="font-medium text-status-attention">
                {count(total)} not committed
              </span>
            )}
            <span aria-hidden="true" className="text-content-muted">
              ·
            </span>
            <span className="text-content-muted">checked a minute ago</span>
            <InlineAction onClick={noop}>Check again</InlineAction>
          </Typography>
        )}

        {state.committed ? (
          <InlineNote tone="info" icon={GitCommitHorizontal} role="status">
            You committed {count(state.committed.count)} on{' '}
            <span className={MONO_BRANCH}>{BRANCH}</span> ·{' '}
            <span className="font-mono">{state.committed.sha.slice(0, 7)}</span>
          </InlineNote>
        ) : null}

        {state.blocker ? (
          <InlineNote tone="attention" role="status" data-git-blocker="">
            {state.blocker.action} {state.blocker.why} {state.blocker.todo}
          </InlineNote>
        ) : null}

        {state.groups.length > 0 ? (
          <div className="grid min-w-0">
            {state.groups.map((group) => (
              <OriginRow key={group.origin} group={group} open={openRows} />
            ))}
          </div>
        ) : null}

        {state.calm ? (
          <Typography as="p" variant="body-sm" className="text-content-secondary">
            {state.calm}
          </Typography>
        ) : null}
      </div>

      {total > 0 && state.read === 'ok' ? (
        <WorkspaceSection.Footer>
          <Button
            size="sm"
            variant="secondary"
            leadingIcon={GitCommitHorizontal}
            onClick={onCommit}
          >
            Commit changes…
          </Button>
        </WorkspaceSection.Footer>
      ) : null}
    </WorkspaceSection>
  );
}

/** A suggestion SpecFlow derives from what is chosen (attempt commits read the same way). */
function suggestedMessage(base: Exclude<GitStateCase, `dialog-${string}`>) {
  switch (base) {
    case 'taken-over':
      return 'spec(specification): Breakdown (attempt 2) by you\n\nKeeps the agent’s work from attempt 1 (taken over) and ux.md.';
    case 'commit-failed':
      return 'spec(specification): Breakdown (attempt 1) by agent, committed by you';
    case 'many-files':
      return 'spec(single-sign-on): update overview.md and 34 other files';
    default:
      return 'spec(single-sign-on): update overview.md and decisions.md';
  }
}

/** The file's checkbox row: the name, then its folder in the muted tone (as in the section). */
function FileChoice({
  path,
  checked,
  onChange,
}: {
  readonly path: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  const { name, folder } = pathParts(path, DIR);

  return (
    <li className="flex min-w-0 items-start gap-2.5 py-1" title={path}>
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
        aria-label={path}
        className="mt-0.5"
      />
      <span className="grid min-w-0 text-body-sm">
        <span className="text-content-primary [overflow-wrap:anywhere]">{name}</span>
        {folder ? (
          <span className="text-content-muted [overflow-wrap:anywhere]">{folder}</span>
        ) : null}
      </span>
    </li>
  );
}

/** Choose files, a prefilled message, Commit: everything that decides the commit is said before it. */
export function CommitDialog({
  base,
  mode,
}: {
  readonly base: Exclude<GitStateCase, `dialog-${string}`>;
  readonly mode: 'edit' | 'nothing' | 'committing' | 'refused';
}) {
  const groups = data[base as keyof typeof data].groups;
  const all = groups.flatMap((group) => group.paths);
  // The agent's work whose commit failed is left out at first: Retry commit is its own way.
  const initial = useMemo(
    () =>
      new Set(
        mode === 'nothing'
          ? []
          : groups.flatMap((group) => (group.origin === 'agent-commit-failed' ? [] : group.paths)),
      ),
    [groups, mode],
  );
  const [chosen, setChosen] = useState<ReadonlySet<string>>(initial);
  const [message, setMessage] = useState(suggestedMessage(base));
  const allState = chosen.size === all.length ? true : chosen.size === 0 ? false : 'indeterminate';
  const toggle = (path: string, on: boolean) =>
    setChosen((current) => {
      const next = new Set(current);
      if (on) {
        next.add(path);
      } else {
        next.delete(path);
      }

      return next;
    });
  const firstLine = message.split('\n')[0] ?? '';
  const blocked =
    chosen.size === 0
      ? 'Choose at least one file to commit.'
      : firstLine.trim() === ''
        ? 'Write the first line of the message.'
        : undefined;
  const busy = mode === 'committing';

  return (
    <Dialog open onOpenChange={noop}>
      <DialogContent closeLabel="Close">
        <DialogHeader>
          <DialogTitle>Commit changes</DialogTitle>
          <DialogDescription>
            One commit on <span className={MONO_BRANCH}>{BRANCH}</span>, in this specification’s
            checkout. Files you leave out stay as they are, not committed.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-5">
            {mode === 'refused' ? (
              <Alert tone="danger" role="alert" title="Git refused the commit">
                <div className="grid gap-2">
                  <p>
                    A Git hook in this repository failed (
                    <code className="font-mono">COMMIT_BLOCKED</code>). Nothing was committed; your
                    choice and message are kept. Fix the cause, then Commit again.
                  </p>
                  <pre className="overflow-x-auto rounded-control bg-surface-subtle p-2 font-mono text-body-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
                    pre-commit: Cannot find module &apos;eslint/package.json&apos;
                  </pre>
                </div>
              </Alert>
            ) : null}

            <fieldset className="grid min-w-0 gap-2" disabled={busy}>
              <legend className="mb-2 text-label-sm font-medium text-content-primary">Files</legend>
              <label className="flex items-center gap-2.5 text-body-sm">
                <Checkbox
                  checked={allState === true}
                  indeterminate={allState === 'indeterminate'}
                  onCheckedChange={(value) => setChosen(new Set(value === true ? all : []))}
                />
                <span className="text-content-primary">
                  All files
                  <span className="text-content-muted">
                    {' '}
                    · {chosen.size} of {all.length} chosen
                  </span>
                </span>
              </label>
              {groups.map((group) => {
                const origin = origins[group.origin];
                const OriginIcon = origin.icon;
                const picked = group.paths.filter((path) => chosen.has(path)).length;
                const files = (
                  <ul className="grid">
                    {group.paths.map((path) => (
                      <FileChoice
                        key={path}
                        path={path}
                        checked={chosen.has(path)}
                        onChange={(on) => toggle(path, on)}
                      />
                    ))}
                  </ul>
                );

                return (
                  <section
                    key={group.origin}
                    className="grid min-w-0 gap-1 border-t border-border-subtle pt-2"
                  >
                    <label className="flex items-start gap-2.5">
                      <Checkbox
                        className="mt-0.5"
                        checked={picked === group.paths.length}
                        indeterminate={picked > 0 && picked < group.paths.length}
                        onCheckedChange={(value) =>
                          setChosen((current) => {
                            const next = new Set(current);
                            for (const path of group.paths) {
                              if (value === true) {
                                next.add(path);
                              } else {
                                next.delete(path);
                              }
                            }

                            return next;
                          })
                        }
                      />
                      <span className="grid gap-0.5">
                        <span className="flex flex-wrap items-center gap-x-2 text-label-sm font-medium text-content-primary">
                          <OriginIcon
                            aria-hidden="true"
                            className="size-4 shrink-0 text-content-muted"
                          />
                          {origin.label}
                          <span className="font-normal whitespace-nowrap text-content-muted">
                            · {picked} of {count(group.paths.length)}
                          </span>
                        </span>
                        <span className="text-body-sm text-content-secondary">{origin.note}</span>
                      </span>
                    </label>
                    {/* A long group waits behind its count, so the message stays in reach. */}
                    {group.paths.length > 8 ? (
                      <Collapsible className="pl-6">
                        <Collapsible.Trigger className="text-body-sm">
                          Show the {group.paths.length} files
                        </Collapsible.Trigger>
                        <Collapsible.Content>{files}</Collapsible.Content>
                      </Collapsible>
                    ) : (
                      <div className="pl-6">{files}</div>
                    )}
                  </section>
                );
              })}
            </fieldset>

            <Field>
              <Field.Label>Message</Field.Label>
              <TextArea
                rows={3}
                value={message}
                disabled={busy}
                onChange={(event) => setMessage(event.target.value)}
              />
              <Field.Description>
                Suggested from what you chose. The first line says what the commit does, in at most
                100 characters ({firstLine.length} now).
              </Field.Description>
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          {blocked && !busy ? <InlineNote className="mr-auto min-w-0">{blocked}</InlineNote> : null}
          <Button variant="secondary" onClick={noop} disabled={busy}>
            Cancel
          </Button>
          <Button
            leadingIcon={GitCommitHorizontal}
            disabled={Boolean(blocked) || busy}
            aria-busy={busy}
            onClick={noop}
          >
            {busy ? 'Committing…' : chosen.size === 0 ? 'Commit' : `Commit ${count(chosen.size)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One story: the routed Overview, its Repository section replaced, and the dialog when open. */
export function GitStateMock({ state }: { readonly state: GitStateCase }) {
  const dialog = state.startsWith('dialog-');
  const base: Exclude<GitStateCase, `dialog-${string}`> = dialog
    ? dialogBase[state as `dialog-${string}`]!
    : (state as Exclude<GitStateCase, `dialog-${string}`>);
  const routed = scenarioOf(base);
  const mode =
    state === 'dialog-nothing-chosen'
      ? 'nothing'
      : state === 'dialog-committing'
        ? 'committing'
        : state === 'dialog-refused'
          ? 'refused'
          : 'edit';

  return (
    <div className={cn('contents')}>
      <WorkflowExecutionFixture {...routed} />
      {base === 'git-off' ? (
        <Replace find={findRepository} hideParent>
          {null}
        </Replace>
      ) : (
        <Replace find={findRepository}>
          <GitStateSection state={data[base]} />
        </Replace>
      )}
      {base !== 'git-off' && attentionOf(base).length > 0 ? (
        <Replace find={findAttention}>
          <AttentionSection items={attentionOf(base)} />
        </Replace>
      ) : null}
      {dialog ? (
        <StoryLocalization>
          <CommitDialog base={base} mode={mode} />
        </StoryLocalization>
      ) : null}
    </div>
  );
}
