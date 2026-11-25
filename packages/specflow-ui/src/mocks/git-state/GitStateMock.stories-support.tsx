import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { GitCommitHorizontal, Trash2 } from 'lucide-react';
import {
  Alert,
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
  InlineNote,
  SegmentedControl,
  TextArea,
  Typography,
} from '@nevo/ui';
import { WorkflowExecutionFixture } from '../../features/tasks/execution/ProjectWorkflowExecution.stories-support';
import { InlineAction } from '../../features/tasks/execution/InlineAction';
import { AttentionSection } from '../../features/specs/workspace/sections/AttentionSection';
import { StoryLocalization } from '../../i18n/StoryLocalization';
import { WorkspaceSection } from '../../shared/workspace-section';

/*
 * PRESENTATION MOCK ONLY (owner acceptance of the Git state of a Specification, PR #169, round 2
 * after the independent UX review and the owner's decisions). The real routed screens with only
 * these regions replaced by the mock's: the Overview's Repository section (the shipped section's
 * facts and View changes kept, Git state and Commit/Discard added), the git module's Requires
 * attention entry, the Now block's failed-commit note (one more action), the Changes page's
 * Uncommitted list, the Run with agent blocker (Commit and Discard added) and the attempt's
 * committed history row. Static data, no commands, no interaction tests.
 *
 * One form for changed files everywhere (Now, the section, the dialogs, the Changes page): the
 * shipped Now/Close list, full checkout-relative path in monospace that wraps (nothing hidden behind
 * a tooltip at 375 px), at most five then "and N more" where a list is a summary.
 */

const BRANCH = 'nevo-1/single-sign-on';
const OTHER_BRANCH = 'feature/login-redesign';
const DIR = 'specs/active/single-sign-on';
const MONO = 'font-mono text-content-primary [overflow-wrap:anywhere]';
const BRANCH_TEXT = 'font-mono whitespace-nowrap text-content-primary';
const PATHS_SHOWN = 5;
/** Most paths one commit or discard may name (`MANUAL_COMMIT_PATHS_MAX`). */
const PATHS_MAX = 200;
const noop = () => undefined;

/** A file, or files saved in one step (they are committed and discarded together). */
type Item = string | readonly string[];

/**
 * What the data can tell about uncommitted files: an agent attempt's work (its commit failed, or
 * the attempt was taken over: the attempt's changed paths), saves through SpecFlow (the ledger: by
 * the owner or an agent's `documents save`, it does not say who), saves still being written (the
 * queue), and everything else Git sees ("changed outside SpecFlow", the Run with agent wording).
 */
type GroupKind = 'attempt-failed' | 'attempt-taken-over' | 'saved' | 'writing' | 'outside';

interface Group {
  readonly kind: GroupKind;
  readonly items: readonly Item[];
}

interface Blocker {
  /** The blocked action, named as its button. */
  readonly action: string;
  readonly why: string;
  /** The groups whose files block it (SpecFlow's own saves never block Run with agent). */
  readonly covers: readonly GroupKind[];
}

interface WidgetData {
  readonly read?: 'ok' | 'unknown';
  readonly groups: readonly Group[];
  readonly blocker?: Blocker;
  /** Only saves: nothing waits yet; say what will. */
  readonly calm?: string;
  readonly committed?: { readonly sha: string; readonly count: number };
  /** The checkout moved to another branch than the one the saves were made on. */
  readonly branchChanged?: boolean;
  readonly linkedPr?: boolean;
  readonly sync?: string;
}

const doc = (name: string) => `${DIR}/${name}`;
const flat = (items: readonly Item[]) =>
  items.flatMap((item) => (typeof item === 'string' ? [item] : item));

const FAILED_PATHS = [doc('tasks/t-01/task.md'), doc('tasks/t-02/task.md')];
const TAKEN_OVER_PATHS = [
  'packages/identity/src/sign-in/return-to-project.ts',
  'packages/identity/src/sign-in/return-to-project.test.ts',
  doc('tasks/t-02/task.md'),
];
const longPaths = [
  doc(
    'tasks/t-04-return-users-to-where-they-were/attachments/screens/narrow-375/sign-in-return.png',
  ),
  'packages/identity/src/features/sign-in/return-to-project/restore-last-open-project-location.ts',
];
const manyPaths = (total: number): readonly string[] => [
  ...longPaths,
  ...Array.from({ length: total - longPaths.length }, (_, index) =>
    index % 3 === 0
      ? doc(`tasks/t-${String(index + 10).padStart(3, '0')}/task.md`)
      : index % 3 === 1
        ? `packages/identity/src/session/cookie-${index}.ts`
        : `docs/reference/identity/claims/claim-${index}.md`,
  ),
];

/** The group headings and their one explanation: the same words in the section and the dialogs. */
const groupText: Record<GroupKind, { readonly heading: string; readonly note?: string }> = {
  'attempt-failed': { heading: 'Breakdown, attempt 1 · its commit failed' },
  'attempt-taken-over': {
    heading: 'Return users to where they were · Implementation, attempt 2 · taken over',
    note: 'The files the agent’s attempt changed before you took over; any edits since are in them too.',
  },
  saved: {
    heading: 'Saved in SpecFlow, not committed',
    note: 'Saved through SpecFlow while the project commits documents only when told to.',
  },
  writing: {
    heading: 'Still being saved',
    note: 'SpecFlow is writing these saves now. They can be committed or discarded once saved.',
  },
  outside: {
    heading: 'Changed outside SpecFlow',
    note: 'These files changed outside SpecFlow and are not committed.',
  },
};

const RUN_WITH_AGENT: Blocker = {
  action: 'Run with agent cannot start on any task',
  why: 'while these files are not committed: the agent starts from a committed checkout, so that everything that changes afterwards is its own work. Commit or discard them to continue. (Files saved in SpecFlow do not block it.)',
  covers: ['attempt-taken-over', 'outside'],
};

export type GitStateCase =
  | 'clean'
  | 'committed-just-now'
  | 'saved-nothing-waits'
  | 'changed-outside'
  | 'taken-over'
  | 'close-waits'
  | 'commit-failed'
  | 'commit-failed-committed-by-you'
  | 'agent-work-discarded'
  | 'history-committed-by-you'
  | 'many-files'
  | 'being-saved'
  | 'branch-changed'
  | 'unknown'
  | 'git-off'
  | 'run-with-agent-blocked'
  | 'changes-page'
  | 'dialog-taken-over'
  | 'dialog-saved-together'
  | 'dialog-many-files'
  | 'dialog-path-limit'
  | 'dialog-nothing-chosen'
  | 'dialog-agent-commit-failed'
  | 'dialog-being-saved'
  | 'dialog-branch-changed'
  | 'dialog-committing'
  | 'dialog-refused-hook'
  | 'dialog-conflict'
  | 'discard-choose'
  | 'discard-confirm'
  | 'discard-agent-work'
  | 'discard-refused';

type Base =
  | 'clean'
  | 'committed-just-now'
  | 'saved-nothing-waits'
  | 'changed-outside'
  | 'taken-over'
  | 'close-waits'
  | 'commit-failed'
  | 'many-files'
  | 'path-limit'
  | 'being-saved'
  | 'branch-changed'
  | 'unknown';

const data: Record<Base, WidgetData> = {
  clean: { groups: [], linkedPr: true },
  'committed-just-now': { groups: [], committed: { sha: '9c2e4d17', count: 2 } },
  'saved-nothing-waits': {
    groups: [{ kind: 'saved', items: [[doc('ux.md'), doc('requirements.md')]] }],
    calm: 'Nothing waits for them now. Close specification will wait until they are committed.',
  },
  'changed-outside': {
    groups: [{ kind: 'outside', items: [doc('overview.md'), doc('decisions.md')] }],
    blocker: RUN_WITH_AGENT,
  },
  'taken-over': {
    groups: [
      { kind: 'attempt-taken-over', items: TAKEN_OVER_PATHS },
      { kind: 'outside', items: [doc('overview.md')] },
    ],
    blocker: RUN_WITH_AGENT,
  },
  'close-waits': {
    groups: [
      { kind: 'saved', items: [[doc('ux.md'), doc('requirements.md')], doc('decisions.md')] },
    ],
    blocker: {
      action: 'Close specification waits for these files',
      why: 'because Close leaves nothing uncommitted. Commit or discard them, then Close.',
      covers: ['saved'],
    },
  },
  // Now's note says what waits and why; the section only lists the files (one wording).
  'commit-failed': { groups: [{ kind: 'attempt-failed', items: FAILED_PATHS }] },
  'many-files': {
    groups: [
      { kind: 'saved', items: [doc('overview.md')] },
      { kind: 'outside', items: manyPaths(34) },
    ],
    blocker: RUN_WITH_AGENT,
  },
  'path-limit': {
    groups: [{ kind: 'outside', items: manyPaths(230) }],
    blocker: RUN_WITH_AGENT,
  },
  'being-saved': {
    groups: [
      { kind: 'writing', items: [[doc('ux.md'), doc('requirements.md')]] },
      { kind: 'outside', items: [doc('overview.md')] },
    ],
    blocker: RUN_WITH_AGENT,
  },
  'branch-changed': {
    groups: [{ kind: 'saved', items: [doc('ux.md')] }],
    branchChanged: true,
  },
  unknown: { read: 'unknown', groups: [] },
};

function count(files: number) {
  return files === 1 ? '1 file' : `${files} files`;
}

function uncommitted(files: number) {
  return files === 1 ? '1 uncommitted file' : `${files} uncommitted files`;
}

/** Inserts `children` in place of the first element `find` returns (hidden), inside the real screen. */
function Replace({
  find,
  children,
  hideParent = false,
}: {
  readonly find: () => HTMLElement | null | undefined;
  readonly children: ReactNode;
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

const outsideMock = (element: Element) => !element.closest('[data-mock-replacement]');

/**
 * The shipped Repository section where the read model renders it; where it does not (project
 * mode's `not_implemented`), a placeholder at its place in the `context` slot after Documents.
 */
const findRepository = () => {
  const existing = document.querySelector<HTMLElement>(
    'section[aria-labelledby="repo-heading"], section[data-mock-repository-slot]',
  );
  if (existing) {
    return existing;
  }

  const documents = Array.from(document.querySelectorAll<HTMLElement>('h2, h3')).find(
    (heading) => heading.textContent?.trim() === 'Documents' && outsideMock(heading),
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

/** Requires attention's place under Now (the section appears only with items). */
const findAttention = () => {
  const existing = document.querySelector<HTMLElement>('[data-mock-attention-slot]');
  if (existing) {
    return existing;
  }

  const now = Array.from(document.querySelectorAll<HTMLElement>('[data-workflow-now]')).find(
    outsideMock,
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

const findBySelector = (selector: string) => () =>
  Array.from(document.querySelectorAll<HTMLElement>(selector)).find(outsideMock);

/** Now's Confirm and Reject row. */
const findConfirmRow = () =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('[data-workflow-now] button')).find(
    (button) => outsideMock(button) && button.textContent?.trim() === 'Confirm',
  )?.parentElement;

/** Now's line of what the attempt committed ("7 documents committed · 3f9c2a1"). */
const findHandoffCommit = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-workflow-now] *')).find(
    (element) =>
      outsideMock(element) &&
      element.children.length <= 2 &&
      /^\d+ documents? committed/.test(element.textContent?.trim() ?? ''),
  );

/** The Changes page's view (the one with the Base / Uncommitted / PR switch). */
const findChangesView = () => {
  const view = Array.from(document.querySelectorAll<HTMLElement>('[role="radiogroup"]'))
    .find(outsideMock)
    ?.closest<HTMLElement>('.grid');
  if (view) {
    return view;
  }

  // Project mode answers the Changes read `not_implemented`: the page shows its unavailable card.
  const title = Array.from(document.querySelectorAll<HTMLElement>('main *')).find(
    (element) =>
      outsideMock(element) &&
      element.children.length === 0 &&
      element.textContent?.trim() === 'Not available on this server',
  );
  let card = title?.parentElement ?? null;
  while (card && !card.className.includes('border')) {
    card = card.parentElement;
  }

  return card;
};

/** The Run with agent dialog's "Commit or undo these changes first" block. */
const findAgentBlocker = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"] [role="status"]')).find(
    (element) =>
      outsideMock(element) && (element.textContent ?? '').includes('Commit or undo these changes'),
  );

/** Check again: the shipped control of the Run with agent blocker, everywhere. */
function CheckAgain({ busy = false }: { readonly busy?: boolean }) {
  return (
    <Button size="sm" variant="secondary" leadingIcon="refresh" onClick={noop} disabled={busy}>
      {busy ? 'Checking…' : 'Check again'}
    </Button>
  );
}

/** One changed file: the full checkout-relative path, wrapping; the shipped Now/Close form. */
function PathText({ path }: { readonly path: string }) {
  return <span className={MONO}>{path}</span>;
}

/** Changed files as Now and Close list them: five, then "and N more" (`limit: false`: all). */
export function ChangedFiles({
  paths,
  limit = true,
  after,
}: {
  readonly paths: readonly string[];
  readonly limit?: boolean;
  /** An action at the end of a row (the Changes page's Diff). */
  readonly after?: (path: string) => ReactNode;
}) {
  const shown = limit ? paths.slice(0, PATHS_SHOWN) : paths;
  const more = paths.length - shown.length;

  return (
    <ul className="grid list-disc gap-0.5 pl-5 text-body-sm marker:text-content-muted">
      {shown.map((path) => (
        <li key={path}>
          <span className="flex min-w-0 items-start justify-between gap-3">
            <PathText path={path} />
            {after?.(path)}
          </span>
        </li>
      ))}
      {more > 0 ? <li className="list-none text-content-muted">and {more} more</li> : null}
    </ul>
  );
}

function GroupHeading({ group, picked }: { readonly group: Group; readonly picked?: number }) {
  const total = flat(group.items).length;

  return (
    <span className="flex flex-wrap items-baseline gap-x-2 text-label-sm font-medium text-content-primary">
      {groupText[group.kind].heading}
      <span className="font-normal whitespace-nowrap text-content-muted">
        · {picked === undefined ? count(total) : `${picked} of ${count(total)}`}
      </span>
    </span>
  );
}

/** The shipped section's first lines: branch and base, then uncommitted · sync · conflicts. */
function RepositoryFacts({ state }: { readonly state: WidgetData }) {
  const total = state.groups.reduce((sum, group) => sum + flat(group.items).length, 0);

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-3 text-body-sm">
        <span className="font-semibold text-content-primary [overflow-wrap:anywhere]">
          {state.branchChanged ? OTHER_BRANCH : BRANCH}
        </span>
        <span className="text-content-muted">base main</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-content-secondary">
        {state.read === 'unknown' ? (
          <span>Local changes unknown</span>
        ) : (
          <span className={total > 0 ? 'font-medium text-status-attention' : undefined}>
            {total === 0 ? 'Everything is committed' : uncommitted(total)}
          </span>
        )}
        <span aria-hidden="true" className="text-content-muted">
          ·
        </span>
        <span>
          {state.read === 'unknown' ? 'Sync unknown' : (state.sync ?? '3 commits ahead of main')}
        </span>
        <span aria-hidden="true" className="text-content-muted">
          ·
        </span>
        <span>{state.read === 'unknown' ? 'Conflicts unknown' : 'No conflicts'}</span>
      </div>
    </>
  );
}

/**
 * The Overview's Repository section: the shipped facts, linked PR and View changes, with the Git
 * state, what waits for the files and why, the files by what is known of them, Commit and Discard.
 */
export function GitStateSection({ state }: { readonly state: WidgetData }) {
  const total = state.groups.reduce((sum, group) => sum + flat(group.items).length, 0);
  const writingOnly = state.groups.every((group) => group.kind === 'writing');

  return (
    <WorkspaceSection aria-labelledby="git-state-heading" data-git-state="">
      <WorkspaceSection.Header id="git-state-heading" title="Repository" icon="branch" />
      <div className="grid gap-2.5">
        <div className="grid gap-2">
          <RepositoryFacts state={state} />
        </div>

        {state.read === 'unknown' ? (
          <InlineNote tone="attention" role="status">
            <strong className="font-medium">SpecFlow could not read Git in this checkout</strong>{' '}
            (Git did not answer within 10 seconds). Whether files are uncommitted is unknown, so
            nothing can be committed or discarded until it reads again.
            <div className="mt-2">
              <CheckAgain />
            </div>
          </InlineNote>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-content-muted">
            <span>Checked a minute ago</span>
            <CheckAgain />
          </div>
        )}

        {state.linkedPr ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-body-sm">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-body-sm text-content-muted">PR #128</span>
              <span className="font-medium text-content-primary">Single sign-on</span>
            </div>
            <Button size="sm" variant="secondary" onClick={noop}>
              Review PR
            </Button>
          </div>
        ) : null}

        {state.committed ? (
          <InlineNote tone="info" icon={GitCommitHorizontal} role="status">
            You committed {count(state.committed.count)} on{' '}
            <span className={BRANCH_TEXT}>{BRANCH}</span> ·{' '}
            <span className="font-mono">{state.committed.sha.slice(0, 7)}</span>
          </InlineNote>
        ) : null}

        {state.branchChanged ? (
          <InlineNote tone="attention" role="status">
            <strong className="font-medium">
              These saves cannot be committed or discarded now:
            </strong>{' '}
            they were made on <span className={BRANCH_TEXT}>{BRANCH}</span>, and the checkout is on{' '}
            <span className={BRANCH_TEXT}>{OTHER_BRANCH}</span> now. Switch the checkout back to{' '}
            <span className={BRANCH_TEXT}>{BRANCH}</span> (for example with git switch), then check
            again.
          </InlineNote>
        ) : null}

        {state.groups.map((group, index) => (
          <div key={group.kind} className="grid min-w-0 gap-1">
            {/* What waits for these files, next to the first group that holds it up. */}
            {state.blocker &&
            state.blocker.covers.includes(group.kind) &&
            state.groups.findIndex((other) => state.blocker!.covers.includes(other.kind)) ===
              index ? (
              <InlineNote tone="attention" role="status" data-git-blocker="" className="mb-1">
                <strong className="font-medium">{state.blocker.action}</strong> {state.blocker.why}
              </InlineNote>
            ) : null}
            <GroupHeading group={group} />
            {groupText[group.kind].note && group.kind !== 'outside' ? (
              <Typography as="p" variant="body-sm" className="text-content-secondary">
                {groupText[group.kind].note}
              </Typography>
            ) : null}
            <ChangedFiles paths={flat(group.items)} />
          </div>
        ))}

        {state.calm ? (
          <Typography as="p" variant="body-sm" className="text-content-secondary">
            {state.calm}
          </Typography>
        ) : null}
      </div>

      <WorkspaceSection.Footer className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={noop}>
          View changes
        </Button>
        {total > 0 && state.read !== 'unknown' && !state.branchChanged && !writingOnly ? (
          <>
            <Button size="sm" variant="secondary" leadingIcon={GitCommitHorizontal} onClick={noop}>
              Commit changes…
            </Button>
            <Button size="sm" variant="ghost" leadingIcon={Trash2} onClick={noop}>
              Discard changes…
            </Button>
          </>
        ) : null}
      </WorkspaceSection.Footer>
    </WorkspaceSection>
  );
}

/** The git module's Requires attention entry, with Commit as its action. */
function attentionOf(base: Base) {
  const state = data[base];
  if (!state.blocker) {
    return [];
  }

  const blocker = state.blocker;
  const total = state.groups
    .filter((group) => blocker.covers.includes(group.kind))
    .reduce((sum, group) => sum + flat(group.items).length, 0);

  return [
    {
      renderKey: 'git',
      icon: 'branch' as const,
      item: {
        id: 'git-uncommitted',
        kind: 'git' as const,
        title: uncommitted(total),
        reason: blocker.action,
        actionLabel: 'Commit changes…',
      },
      facts: ['Repository', BRANCH],
      tone: 'attention' as const,
      reasonIcon: 'triangle-alert' as const,
      action: { label: 'Commit changes…', onClick: noop },
    },
  ];
}

/** A plain suggestion from what is chosen; the owner edits it freely. */
function suggestedMessage(base: Base) {
  switch (base) {
    case 'taken-over':
      return 'Return users to where they were: keep the work of implementation attempt 2';
    case 'commit-failed':
      return 'Breakdown: keep the tasks of attempt 1 (t-01, t-02)';
    case 'close-waits':
    case 'saved-nothing-waits':
    case 'branch-changed':
      return 'Update the UX, requirements and decisions documents';
    case 'many-files':
      return 'Update overview.md and 34 other files';
    case 'path-limit':
      return 'Update the identity package and its documents';
    default:
      return 'Update the overview and decisions documents';
  }
}

type DialogMode =
  'edit' | 'nothing' | 'committing' | 'refused-hook' | 'conflict' | 'discard' | 'agent-failed';

/** One row to choose: a file, or files saved in one step (one checkbox, they go together). */
function ItemChoice({
  item,
  checked,
  disabled,
  onChange,
}: {
  readonly item: Item;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  const paths = typeof item === 'string' ? [item] : item;

  return (
    <li className="flex min-w-0 items-start gap-2.5 py-1">
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onChange(value === true)}
        aria-label={paths.join(', ')}
        className="mt-0.5"
      />
      <span className="grid min-w-0 gap-0.5 text-body-sm">
        {paths.map((path) => (
          <PathText key={path} path={path} />
        ))}
        {paths.length > 1 ? (
          <span className="text-content-muted">Saved together, so they go together</span>
        ) : null}
      </span>
    </li>
  );
}

const itemKey = (item: Item) => (typeof item === 'string' ? item : item.join('\n'));

/**
 * Choose what to commit (or discard): groups by what is known of the files, one checkbox per save
 * (files saved together go together), everything that decides the result said before the click.
 */
export function CommitDialog({
  base,
  mode,
  intent = 'commit',
}: {
  readonly base: Base;
  readonly mode: DialogMode;
  readonly intent?: 'commit' | 'discard';
}) {
  const state = data[base];
  const groups = state.groups;
  const choosable = groups.filter((group) => group.kind !== 'writing');
  const allItems = choosable.flatMap((group) => group.items);
  const initial = useMemo(
    () => new Set(mode === 'nothing' ? [] : allItems.map(itemKey)),
    [allItems, mode],
  );
  const [chosen, setChosen] = useState<ReadonlySet<string>>(initial);
  const [message, setMessage] = useState(suggestedMessage(base));
  const chosenPaths = allItems
    .filter((item) => chosen.has(itemKey(item)))
    .flatMap((item) => (typeof item === 'string' ? [item] : item));
  const allPaths = flat(allItems);
  const writing = groups.some((group) => group.kind === 'writing');
  const busy = mode === 'committing';
  const locked = busy || Boolean(state.branchChanged);
  const firstLine = message.split('\n')[0] ?? '';
  const discard = intent === 'discard';
  const blocked = state.branchChanged
    ? 'Switch the checkout back to its branch first.'
    : writing && !discard
      ? 'Commit waits until SpecFlow has saved the files it is writing.'
      : chosenPaths.length === 0
        ? `Choose at least one file to ${discard ? 'discard' : 'commit'}.`
        : chosenPaths.length > PATHS_MAX
          ? `Choose at most ${PATHS_MAX} files (${chosenPaths.length} are chosen).`
          : !discard && firstLine.trim() === ''
            ? 'Write the first line of the message.'
            : undefined;
  const allState =
    chosenPaths.length === allPaths.length
      ? true
      : chosenPaths.length === 0
        ? false
        : 'indeterminate';
  const setItems = (items: readonly Item[], on: boolean) =>
    setChosen((current) => {
      const next = new Set(current);
      for (const item of items) {
        if (on) {
          next.add(itemKey(item));
        } else {
          next.delete(itemKey(item));
        }
      }

      return next;
    });
  const hasBundles = allItems.some((item) => typeof item !== 'string');

  return (
    <Dialog open onOpenChange={noop}>
      <DialogContent closeLabel="Close">
        <DialogHeader>
          <DialogTitle>{discard ? 'Discard changes' : 'Commit changes'}</DialogTitle>
          <DialogDescription>
            {discard ? (
              <>
                Choose the files whose changes you no longer want. You confirm the exact list before
                anything is lost.{' '}
              </>
            ) : (
              <>
                One commit on <span className={BRANCH_TEXT}>{BRANCH}</span> by the Git identity set
                up where SpecFlow runs. Files you leave out stay as they are.{' '}
              </>
            )}
            <InlineAction onClick={noop}>View changes</InlineAction> shows what changed in each
            file.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-5">
            {mode === 'refused-hook' ? (
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
            {mode === 'conflict' ? (
              <Alert tone="attention" role="alert" title="A file changed while this was open">
                <div className="grid gap-2">
                  <p>
                    Nothing was committed: this file changed after SpecFlow read it, so the commit
                    would hold something you did not see (
                    <code className="font-mono">MANUAL_COMMIT_CONFLICT</code>).
                  </p>
                  <ChangedFiles paths={[TAKEN_OVER_PATHS[0]!]} />
                  <p>Check again to read the files as they are now, then Commit.</p>
                  <div>
                    <CheckAgain />
                  </div>
                </div>
              </Alert>
            ) : null}
            {state.branchChanged ? (
              <InlineNote tone="attention" role="status">
                <strong className="font-medium">The checkout is on another branch.</strong> These
                saves were made on <span className={BRANCH_TEXT}>{BRANCH}</span>; the checkout is on{' '}
                <span className={BRANCH_TEXT}>{OTHER_BRANCH}</span> now. Switch it back, then check
                again. <CheckAgain />
              </InlineNote>
            ) : null}
            {writing && !discard ? (
              <InlineNote tone="info" role="status">
                <strong className="font-medium">SpecFlow is still saving 2 files.</strong> A commit
                takes the files of this specification only when every save is written, usually
                within seconds. <CheckAgain />
              </InlineNote>
            ) : null}

            <fieldset className="grid min-w-0 gap-2" disabled={locked}>
              <legend className="mb-2 text-label-sm font-medium text-content-primary">Files</legend>
              <label className="flex items-center gap-2.5 text-body-sm">
                <Checkbox
                  checked={allState === true}
                  indeterminate={allState === 'indeterminate'}
                  onCheckedChange={(value) => setItems(allItems, value === true)}
                />
                <span className="text-content-primary">
                  All files
                  <span className="text-content-muted">
                    {' '}
                    · {chosenPaths.length} of {allPaths.length} chosen
                  </span>
                </span>
              </label>
              {allPaths.length > PATHS_MAX ? (
                <Typography as="p" variant="body-sm" className="text-content-secondary">
                  One {discard ? 'discard' : 'commit'} takes at most {PATHS_MAX} files;{' '}
                  {allPaths.length} changed. Choose up to {PATHS_MAX} now and the rest afterwards.
                </Typography>
              ) : null}
              {hasBundles ? (
                <Typography as="p" variant="body-sm" className="text-content-secondary">
                  Files SpecFlow saved in one step are {discard ? 'discarded' : 'committed'}{' '}
                  together: they share one checkbox.
                </Typography>
              ) : null}
              {groups.map((group) => {
                const groupPaths = flat(group.items);
                const picked = group.items
                  .filter((item) => chosen.has(itemKey(item)))
                  .flatMap((item) => (typeof item === 'string' ? [item] : item)).length;
                const isWriting = group.kind === 'writing';
                const rows = (
                  <ul className="grid">
                    {group.items.map((item) => (
                      <ItemChoice
                        key={itemKey(item)}
                        item={item}
                        checked={!isWriting && chosen.has(itemKey(item))}
                        disabled={isWriting || locked}
                        onChange={(on) => setItems([item], on)}
                      />
                    ))}
                  </ul>
                );

                return (
                  <section
                    key={group.kind}
                    className="grid min-w-0 gap-1 border-t border-border-subtle pt-2"
                  >
                    <label className="flex items-start gap-2.5">
                      <Checkbox
                        className="mt-0.5"
                        disabled={isWriting || locked}
                        checked={!isWriting && picked === groupPaths.length}
                        indeterminate={!isWriting && picked > 0 && picked < groupPaths.length}
                        onCheckedChange={(value) => setItems(group.items, value === true)}
                      />
                      <span className="grid gap-0.5">
                        <GroupHeading group={group} picked={isWriting ? undefined : picked} />
                        {groupText[group.kind].note ? (
                          <span className="text-body-sm text-content-secondary">
                            {groupText[group.kind].note}
                          </span>
                        ) : null}
                        {group.kind === 'attempt-failed' && discard ? (
                          <span className="text-body-sm text-content-secondary">
                            Discarding them leaves only Reject for the agent’s result: Confirm would
                            approve a result whose files are gone.
                          </span>
                        ) : null}
                        {(group.kind === 'attempt-failed' || group.kind === 'attempt-taken-over') &&
                        !discard ? (
                          <span className="text-body-sm text-content-secondary">
                            Committing them makes the commit yours; the attempt’s history says you
                            committed its work
                            {group.kind === 'attempt-failed'
                              ? ', and Confirm and Reject become possible.'
                              : '.'}
                          </span>
                        ) : null}
                      </span>
                    </label>
                    {/* A long group waits behind its count, so the message stays in reach. */}
                    {groupPaths.length > 8 ? (
                      <Collapsible className="pl-6">
                        <Collapsible.Trigger className="text-body-sm">
                          Show the {groupPaths.length} files
                        </Collapsible.Trigger>
                        <Collapsible.Content>{rows}</Collapsible.Content>
                      </Collapsible>
                    ) : (
                      <div className="pl-6">{rows}</div>
                    )}
                  </section>
                );
              })}
            </fieldset>

            {discard ? null : (
              <Field>
                <Field.Label>Message</Field.Label>
                <TextArea
                  rows={2}
                  value={message}
                  disabled={locked}
                  onChange={(event) => setMessage(event.target.value)}
                />
                <Field.Description>
                  A suggestion; change it as you like. The first line says what the commit does, in
                  at most 100 characters ({firstLine.length} now).
                </Field.Description>
              </Field>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          {blocked && !busy ? <InlineNote className="mr-auto min-w-0">{blocked}</InlineNote> : null}
          <Button variant="secondary" onClick={noop} disabled={busy}>
            Cancel
          </Button>
          {discard ? (
            <Button
              variant="destructive"
              leadingIcon={Trash2}
              disabled={Boolean(blocked)}
              onClick={noop}
            >
              {chosenPaths.length === 0 ? 'Discard…' : `Discard ${count(chosenPaths.length)}…`}
            </Button>
          ) : (
            <Button
              leadingIcon={GitCommitHorizontal}
              disabled={Boolean(blocked) || busy}
              aria-busy={busy}
              onClick={noop}
            >
              {busy
                ? 'Committing…'
                : chosenPaths.length === 0
                  ? 'Commit'
                  : `Commit ${count(chosenPaths.length)}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The destructive confirmation (the Documents delete pattern): exactly what is lost, for good. */
function DiscardConfirm({
  paths,
  agent,
  refused,
}: {
  readonly paths: readonly string[];
  readonly agent?: boolean;
  readonly refused?: boolean;
}) {
  return (
    <AlertDialog open onOpenChange={noop}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard the changes in {count(paths.length)}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="grid gap-2">
              <p>
                These files go back to their last commit on{' '}
                <span className={BRANCH_TEXT}>{BRANCH}</span>; files that are new are deleted.
              </p>
              <ChangedFiles paths={paths} limit={false} />
              {agent ? (
                <p>
                  This is the work of Breakdown, attempt 1. The attempt’s history keeps saying what
                  it did and that you discarded its work. Afterwards only Reject is possible for its
                  result: Confirm would approve a result whose files are gone.
                </p>
              ) : null}
              <p className="font-medium text-content-primary">
                This cannot be undone: Git keeps no copy of uncommitted changes.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {refused ? (
          <Alert tone="attention" role="alert" title="Nothing was discarded">
            <div className="grid gap-2">
              <p>
                <span className={MONO}>{paths[0]}</span> changed after you chose it, so discarding
                now would also lose changes you have not seen. Check again to see the files as they
                are now.
              </p>
              <div>
                <CheckAgain />
              </div>
            </div>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="secondary">Cancel</Button>
          </AlertDialogCancel>
          <Button variant="destructive" leadingIcon={Trash2} disabled={refused} onClick={noop}>
            Discard {count(paths.length)}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Now's failed-commit note as shipped, with the owner's second way: commit it as yours. */
function FailedCommitNote() {
  return (
    <div className="grid gap-2" data-now-attempt-commit="failed">
      <InlineNote tone="attention" role="alert">
        <span className="font-medium text-content-primary">
          Breakdown is finished, but its commit failed: the branch is protected (
          <span className="font-mono">BRANCH_PROTECTED</span>).
        </span>{' '}
        These 2 files stay uncommitted on <span className={BRANCH_TEXT}>{BRANCH}</span>, and Close
        lists them until they are committed. Confirm and Reject become possible once the agent’s
        work is committed: Retry commit makes the agent’s commit again after you fix the cause, or
        commit the work yourself.
        <div className="mt-1">
          <ChangedFiles paths={FAILED_PATHS} />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" leadingIcon={GitCommitHorizontal} onClick={noop}>
            Retry commit
          </Button>
          <Button size="sm" variant="secondary" onClick={noop}>
            Commit it yourself…
          </Button>
        </div>
      </InlineNote>
    </div>
  );
}

/** Now after the owner discarded the work of the agent's failed commit: only Reject is left. */
function DiscardedNote() {
  return (
    <InlineNote tone="info" icon={Trash2} role="status">
      You discarded the agent’s work of Breakdown, attempt 1. Confirm is not possible: it would
      approve a result whose files are gone. Reject sends the step back with your feedback.
    </InlineNote>
  );
}

/** Now's line of what the attempt committed, when the owner committed the agent's work. */
function CommittedByYouNote() {
  return (
    <Typography as="p" variant="body-sm" className="text-content-secondary">
      Committed by you after the agent’s commit failed · <span className="font-mono">9c2e4d1</span>
    </Typography>
  );
}

/** The attempt history's committed row ("Committed · 05f9d80"), saying who committed. */
function CommittedByYouRow() {
  return (
    <Typography
      as="p"
      variant="body-sm"
      className="flex items-center gap-2 text-content-secondary"
      data-attempt-committed=""
    >
      <GitCommitHorizontal aria-hidden="true" className="size-4 shrink-0 text-content-muted" />
      <span>
        Committed by you after the agent’s commit failed ·{' '}
        <span className="font-mono">9c2e4d1</span>
      </span>
    </Typography>
  );
}

/** The Changes page's Uncommitted view: the shipped page with the one form of files and Commit. */
function ChangesPageView() {
  const groups = data['taken-over'].groups;

  return (
    <div className="grid max-w-content-standard gap-6 py-2">
      <Typography variant="body-sm" className="mt-1 text-content-muted">
        Repository acme-portal · worktree of this specification
      </Typography>
      <SegmentedControl value="uncommitted" onValueChange={noop} aria-label="Changes to show">
        <SegmentedControl.Item value="base">Relative to main</SegmentedControl.Item>
        <SegmentedControl.Item value="uncommitted">Uncommitted</SegmentedControl.Item>
        <SegmentedControl.Item value="mr">PR #128</SegmentedControl.Item>
      </SegmentedControl>
      <Typography variant="body-sm" className="text-content-secondary">
        Changes in this worktree that are not committed.
      </Typography>
      {groups.map((group) => (
        <div key={group.kind} className="grid gap-1">
          <GroupHeading group={group} />
          <ChangedFiles
            paths={flat(group.items)}
            limit={false}
            after={() => (
              <Button size="sm" variant="secondary" onClick={noop}>
                Diff
              </Button>
            )}
          />
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" leadingIcon={GitCommitHorizontal} onClick={noop}>
          Commit changes…
        </Button>
        <Button size="sm" variant="ghost" leadingIcon={Trash2} onClick={noop}>
          Discard changes…
        </Button>
      </div>
    </div>
  );
}

/** Run with agent's blocker, as shipped, with Commit and Discard beside Check again. */
function AgentBlockerWithCommit() {
  return (
    <Alert role="status" tone="attention" title="Commit or discard these changes first">
      <div className="grid gap-2">
        <p>
          These files changed outside SpecFlow and are not committed. The agent starts from a
          committed checkout, so that everything that changes afterwards is its own work. (Documents
          and tasks SpecFlow saved itself do not block it.)
        </p>
        <ChangedFiles paths={['scratch-notes.txt', 'src/auth/refresh.ts']} />
        <p>Commit them, or discard the ones you do not need, then check again.</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="secondary" leadingIcon={GitCommitHorizontal} onClick={noop}>
            Commit these changes…
          </Button>
          <Button size="sm" variant="ghost" leadingIcon={Trash2} onClick={noop}>
            Discard…
          </Button>
          <CheckAgain />
        </div>
      </div>
    </Alert>
  );
}

const dialogs: Partial<
  Record<
    GitStateCase,
    { readonly base: Base; readonly mode: DialogMode; readonly intent?: 'discard' }
  >
> = {
  'dialog-taken-over': { base: 'taken-over', mode: 'edit' },
  'dialog-saved-together': { base: 'close-waits', mode: 'edit' },
  'dialog-many-files': { base: 'many-files', mode: 'edit' },
  'dialog-path-limit': { base: 'path-limit', mode: 'edit' },
  'dialog-nothing-chosen': { base: 'changed-outside', mode: 'nothing' },
  'dialog-agent-commit-failed': { base: 'commit-failed', mode: 'agent-failed' },
  'dialog-being-saved': { base: 'being-saved', mode: 'edit' },
  'dialog-branch-changed': { base: 'branch-changed', mode: 'edit' },
  'dialog-committing': { base: 'taken-over', mode: 'committing' },
  'dialog-refused-hook': { base: 'taken-over', mode: 'refused-hook' },
  'dialog-conflict': { base: 'taken-over', mode: 'conflict' },
  'discard-choose': { base: 'taken-over', mode: 'nothing', intent: 'discard' },
};

const confirms: Partial<
  Record<
    GitStateCase,
    {
      readonly base: Base;
      readonly paths: readonly string[];
      readonly agent?: boolean;
      readonly refused?: boolean;
    }
  >
> = {
  'discard-confirm': { base: 'changed-outside', paths: [doc('overview.md'), doc('decisions.md')] },
  'discard-agent-work': { base: 'commit-failed', paths: FAILED_PATHS, agent: true },
  'discard-refused': {
    base: 'changed-outside',
    paths: [doc('overview.md'), doc('decisions.md')],
    refused: true,
  },
};

/** The section's Git state of each story that is not a dialog. */
const sectionBase: Partial<Record<GitStateCase, Base>> = {
  clean: 'clean',
  'committed-just-now': 'committed-just-now',
  'saved-nothing-waits': 'saved-nothing-waits',
  'changed-outside': 'changed-outside',
  'taken-over': 'taken-over',
  'close-waits': 'close-waits',
  'commit-failed': 'commit-failed',
  'commit-failed-committed-by-you': 'clean',
  'agent-work-discarded': 'clean',
  'history-committed-by-you': 'clean',
  'many-files': 'many-files',
  'being-saved': 'being-saved',
  'branch-changed': 'branch-changed',
  unknown: 'unknown',
};

/** The routed screen each story sits on (its Now is the real one unless replaced). */
function routed(state: GitStateCase, base: Base | undefined) {
  if (state === 'run-with-agent-blocked') {
    return { scenario: 'agent-dirty' } as const;
  }

  if (state === 'changes-page' || state === 'clean' || state === 'committed-just-now') {
    return { scenario: 'attempt-confirmation', confirmationCommit: 'committed' } as const;
  }

  if (state === 'agent-work-discarded') {
    return { scenario: 'attempt-confirmation', confirmationCommit: 'failed' } as const;
  }

  if (state === 'commit-failed-committed-by-you' || state === 'history-committed-by-you') {
    return { scenario: 'attempt-confirmation', confirmationCommit: 'committed' } as const;
  }

  if (base === 'commit-failed') {
    return { scenario: 'attempt-confirmation', confirmationCommit: 'failed' } as const;
  }

  if (base === 'close-waits') {
    return { scenario: 'close-engine-uncommitted' } as const;
  }

  // A Task's Implementation was taken over while the owner does Acceptance's checks.
  if (base === 'taken-over') {
    return { scenario: 'tasks-open' } as const;
  }

  return { scenario: 'waiting' } as const;
}

/** One story: the routed screen, its regions replaced, and the dialog when one is open. */
export function GitStateMock({ state }: { readonly state: GitStateCase }) {
  const dialog = dialogs[state];
  const confirm = confirms[state];
  const base = dialog?.base ?? confirm?.base ?? sectionBase[state];
  const section = state === 'git-off' ? undefined : base;
  const failedNow = base === 'commit-failed';

  return (
    <>
      <WorkflowExecutionFixture {...routed(state, base)} />
      {state === 'git-off' ? (
        <Replace find={findRepository} hideParent>
          {null}
        </Replace>
      ) : null}
      {section ? (
        <Replace find={findRepository}>
          <GitStateSection state={data[section]} />
        </Replace>
      ) : null}
      {section && attentionOf(section).length > 0 ? (
        <Replace find={findAttention}>
          <AttentionSection items={attentionOf(section)} />
        </Replace>
      ) : null}
      {failedNow ? (
        <Replace find={findBySelector('[data-now-attempt-commit="failed"]')}>
          <FailedCommitNote />
        </Replace>
      ) : null}
      {state === 'agent-work-discarded' ? (
        <>
          <Replace find={findBySelector('[data-now-attempt-commit="failed"]')}>
            <DiscardedNote />
          </Replace>
          <Replace find={findConfirmRow}>
            <div className="flex flex-wrap gap-2">
              <Button disabled>Confirm</Button>
              <Button variant="secondary" onClick={noop}>
                Reject
              </Button>
            </div>
          </Replace>
        </>
      ) : null}
      {state === 'commit-failed-committed-by-you' || state === 'history-committed-by-you' ? (
        <>
          <Replace find={findHandoffCommit}>
            <CommittedByYouNote />
          </Replace>
          <Replace find={findBySelector('[data-attempt-committed]')}>
            <CommittedByYouRow />
          </Replace>
        </>
      ) : null}
      {state === 'changes-page' ? (
        <Replace find={findChangesView}>
          <ChangesPageView />
        </Replace>
      ) : null}
      {state === 'run-with-agent-blocked' ? (
        <Replace find={findAgentBlocker}>
          <AgentBlockerWithCommit />
        </Replace>
      ) : null}
      {dialog ? (
        <StoryLocalization>
          <CommitDialog base={dialog.base} mode={dialog.mode} intent={dialog.intent} />
        </StoryLocalization>
      ) : null}
      {confirm ? (
        <StoryLocalization>
          <DiscardConfirm paths={confirm.paths} agent={confirm.agent} refused={confirm.refused} />
        </StoryLocalization>
      ) : null}
    </>
  );
}
