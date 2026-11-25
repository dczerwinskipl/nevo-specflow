import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ShieldCheck, ShieldX } from 'lucide-react';
import type { ToolOperation, WorkSummary } from '@nevo/specflow-contracts/sessions';
import { Collapsible, Icon, Timeline, Typography, cn } from '@nevo/ui';
import { toolOperationOrder } from './workDigest';
import { historyEntry } from './pagedHistoryAnchor';
import { useGroupKeys } from './stableGroupKeys';
import type { ChapterEntry, ToolBurstEntry } from './workGrouping';
import {
  isGroupOpen,
  setGroupOpen,
  useViewState,
  type ViewStore,
  type WorkViewState,
} from './workInspectorStore';
import { workStateTextClassName, workStateTone } from './workStatus';
import { WorkRowContent, useWorkRowMeta } from './WorkRow';
import { workFailureText, workItemTitle, workItemTitleParts } from './toolLabels';

type OpenActions = (workId: string, title: string, permissionId?: string) => void;
type Authorizations = ReadonlyMap<string, WorkSummary>;

/**
 * A Work row's title: the label emphasised ("Ran command", "Allowed"), the subject under it as an
 * identifier — the mono, regular-weight secondary text the Specification key uses — at most two
 * lines.
 */
function WorkTitle({ item }: { item: WorkSummary }) {
  const { t } = useTranslation();
  const { label, subject } = workItemTitleParts(t, item);

  return (
    <>
      {label}
      {subject && (
        <span
          className="mt-0.5 line-clamp-2 block font-mono text-body-sm font-normal text-content-secondary [overflow-wrap:anywhere]"
          data-work-subject=""
        >
          <span className="sr-only"> · </span>
          {subject}
        </span>
      )}
    </>
  );
}

/** A failed tool Work's meta line, then what failed and why, so the row says it unopened. */
function withFailure(meta: ReactNode, item: WorkSummary, t: TFunction): ReactNode {
  const failure = workFailureText(t, item);

  return failure ? (
    <>
      {meta}
      <span className={cn('mt-0.5 block', workStateTextClassName('danger'))}>{failure}</span>
    </>
  ) : (
    meta
  );
}

/**
 * A tool row's meta line with how its permission was answered, when one was folded into it
 * (`foldPermissions`): "Allowed" or "Denied" behind a shield, never a second row for the same
 * operation.
 */
function withAuthorization(meta: ReactNode, permission: WorkSummary | undefined): ReactNode {
  if (!permission?.decision) {
    return meta;
  }

  const denied = permission.decision === 'denied';

  return (
    <>
      {meta}
      {meta ? ' · ' : null}
      <span
        className={cn(
          'inline-flex items-center gap-1 align-bottom',
          denied && workStateTextClassName('danger'),
        )}
        data-work-authorization={permission.decision}
      >
        <Icon
          name={denied ? ShieldX : ShieldCheck}
          size="sm"
          aria-hidden="true"
          className={denied ? undefined : 'text-status-success'}
        />
        <AuthorizationWord decision={permission.decision} />
      </span>
    </>
  );
}

function AuthorizationWord({ decision }: { decision: 'allowed' | 'denied' }) {
  const { t } = useTranslation();

  return <>{t(`managedSession.permissionState.${decision}`)}</>;
}

/** What a tool group holds by kind ("5 commands · 1 read"), from the Runtime's `operation`. */
function burstKinds(burst: ToolBurstEntry, t: TFunction): string | undefined {
  const counts = new Map<ToolOperation, number>();
  for (const item of burst.items) {
    const operation = item.operation ?? 'other';
    counts.set(operation, (counts.get(operation) ?? 0) + 1);
  }

  const kinds = toolOperationOrder
    .filter((operation) => counts.has(operation))
    .map((operation) =>
      t(`managedSession.workSummary.kind.${operation}`, { count: counts.get(operation) }),
    );

  return kinds.length > 0 ? kinds.join(' · ') : undefined;
}

/** The Work ids an entry of a run holds: a tool group's members, or the one item. */
export const chapterEntryMembers = (entry: ChapterEntry): string[] =>
  entry.type === 'burst' ? entry.items.map((item) => item.workId) : [entry.item.workId];

/** A Work row's title on the Timeline rail (`WorkRowContent`). The Timeline is `size="md"`: its
 * title slot is a block that wraps (long tool titles take two lines instead of being cut), and the
 * row carries its own meta line and navigation chevron. */
function InteractionTimelineItem({ item }: { item: WorkSummary }) {
  const { t } = useTranslation();
  const kind = t('managedSession.workKind.interaction');
  // The interaction's own title (e.g. "Permission to write workspace") — previously every
  // interaction showed only the generic kind name, losing what was actually asked — with its kind
  // leading the meta line under it.
  const { meta, srStatus } = useWorkRowMeta(item, { leading: item.title.text ? kind : undefined });
  const title = workItemTitle(t, item);

  return (
    <Timeline.Item {...historyEntry(item.workId)}>
      <Timeline.Marker active={item.state === 'active'} tone={workStateTone(item.state)} />
      <Timeline.Content
        title={
          <WorkRowContent
            title={
              <>
                {title ? <WorkTitle item={item} /> : kind}
                {srStatus}
              </>
            }
            meta={meta}
          />
        }
      />
    </Timeline.Item>
  );
}

/** A tool operation as its own `Timeline.Item`. When the Work has ToolActions, the whole row opens
 * that exact Work's ToolAction details (ToolAction stays the tool's own child, never a top-level
 * row) — one row-sized button with a trailing navigation chevron, never a link-styled title or a
 * separate "Działania narzędzia" text button. Without ToolActions there is nothing to open, so no
 * chevron and no button. State is carried by `useWorkRowMeta` (visible words for anything but a
 * plain completion), never only by the marker's colour — `Timeline.Marker` is `aria-hidden`. */
function ToolTimelineItem({
  item,
  permission,
  onOpenActions,
}: {
  item: WorkSummary;
  /** The permission folded into this tool Work, when one answered for it. */
  permission?: WorkSummary;
  onOpenActions: OpenActions;
}) {
  const { t } = useTranslation();
  const { meta, srStatus } = useWorkRowMeta(item, { actionCount: item.actionCount });
  const title = workItemTitle(t, item);

  return (
    <Timeline.Item {...historyEntry(item.workId)}>
      <Timeline.Marker active={item.state === 'active'} tone={workStateTone(item.state)} />
      <Timeline.Content
        title={
          <WorkRowContent
            bleed="rail"
            title={
              <>
                <WorkTitle item={item} />
                {srStatus}
              </>
            }
            meta={withFailure(withAuthorization(meta, permission), item, t)}
            onOpen={
              item.actionCount
                ? () => onOpenActions(item.workId, title, permission?.workId)
                : undefined
            }
          />
        }
      />
    </Timeline.Item>
  );
}

/** A member of an expanded tool group: exactly the same row (`WorkRowContent`) as a top-level
 * operation, minus its own marker — a group is one marker on the rail ("jedna oś, jedna
 * hierarchia"); its members are that item's details, not a second mini-Timeline. Only completed
 * tools are ever grouped (`groupChapterEntries`), so the state word never shows here. */
function GroupedToolRow({
  item,
  permission,
  onOpenActions,
}: {
  item: WorkSummary;
  permission?: WorkSummary;
  onOpenActions: OpenActions;
}) {
  const { t } = useTranslation();
  const { meta, srStatus } = useWorkRowMeta(item, { actionCount: item.actionCount });
  const title = workItemTitle(t, item);

  return (
    <WorkRowContent
      title={
        <Typography as="span" variant="body-md" className="text-content-primary">
          <WorkTitle item={item} />
          {srStatus}
        </Typography>
      }
      meta={withAuthorization(meta, permission)}
      onOpen={
        item.actionCount ? () => onOpenActions(item.workId, title, permission?.workId) : undefined
      }
    />
  );
}

/** A long (`workGrouping.ts`'s `TOOL_BURST_MIN_SIZE`+) run of adjacent happy-path tool items,
 * compacted into exactly one `Timeline.Item`/marker on the chronology rail, collapsed by default.
 * Its disclosure trigger sits IN the title slot (`Collapsible density="inline"`), so the label
 * shares the marker's line; the disclosure chevron is LEADING (DS: a chevron at the leading edge
 * means expand/collapse) while every member row's navigation chevron is TRAILING, so the two never
 * read as the same control. A shorter run never reaches this component: `groupChapterEntries`
 * leaves it as individual rows.
 *
 * Open or closed is product state of the Turn's view (`isGroupOpen`), not of this component: it
 * survives the group growing or being re-created and the Work screen unmounting (a drill-in to a
 * tool's actions and back, a tab switch). `entryId` is the group's stable identity
 * (`useGroupKeys`), so the reading anchor follows it as members join. */
function ToolBurstTimelineItem({
  burst,
  entryId,
  view,
  authorizations,
  onOpenActions,
}: {
  burst: ToolBurstEntry;
  entryId: string;
  view: ViewStore<WorkViewState>;
  authorizations: Authorizations;
  onOpenActions: OpenActions;
}) {
  const { t } = useTranslation();
  const members = chapterEntryMembers(burst);
  const open = isGroupOpen(useViewState(view), members);

  return (
    <Timeline.Item {...historyEntry(entryId)}>
      <Timeline.Marker tone="success" />
      <Collapsible
        density="inline"
        isExpanded={open}
        onExpandedChange={(next) => view.update((state) => setGroupOpen(state, members, next))}
      >
        <Timeline.Content
          title={
            // Touch target: expand the block axis only, never the visual row — same pattern
            // `ContextNavigationRow` already uses (without it the trigger measures 20×140px, below the
            // DS touch-target rule every other clickable row follows).
            <Collapsible.Trigger className="relative after:absolute after:inset-x-0 after:top-1/2 after:h-[max(100%,var(--target-size))] after:-translate-y-1/2 after:content-['']">
              {t('managedSession.workInspector.toolBurst', { count: burst.items.length })}
            </Collapsible.Trigger>
          }
          description={burstKinds(burst, t)}
        >
          <Collapsible.Content>
            <ul className="grid gap-3 pt-1">
              {burst.items.map((item) => (
                <li key={item.workId} className="min-w-0">
                  <GroupedToolRow
                    item={item}
                    permission={authorizations.get(item.workId)}
                    onOpenActions={onOpenActions}
                  />
                </li>
              ))}
            </ul>
          </Collapsible.Content>
        </Timeline.Content>
      </Collapsible>
    </Timeline.Item>
  );
}

/** A run of operations as one flat `Timeline` (`size="md"`: wrapping titles and a meta line under
 * each), always rendered directly
 * — never behind a chapter-level "N operations" disclosure gate (a short run of 1-4 operations is just shown, not wrapped in a synthetic
 * summary container; `workGrouping.groupChapterEntries` already handles the one remaining case
 * that DOES still compact, a long adjacent happy-path run, into a single burst `Timeline.Item` —
 * see `ToolBurstTimelineItem`). Entries keep their identity as older pages join them
 * (`useGroupKeys`). */
export function WorkOperationsTimeline({
  entries,
  view,
  authorizations,
  onOpenActions,
}: {
  entries: readonly ChapterEntry[];
  view: ViewStore<WorkViewState>;
  /** Permissions folded into the tool Work they were for (`foldPermissions`). */
  authorizations: Authorizations;
  onOpenActions: OpenActions;
}) {
  const { t } = useTranslation();
  const keys = useGroupKeys(entries.map(chapterEntryMembers));
  const count = entries.reduce(
    (sum, entry) => sum + (entry.type === 'burst' ? entry.items.length : 1),
    0,
  );

  // Accessible name only — never rendered as visible text next to Commentary, which would read as
  // "this Commentary owns N operations" (don't claim a stronger ownership/causality than the
  // chronological data supports).
  return (
    <Timeline aria-label={t('managedSession.workInspector.operationsCount', { count })} size="md">
      {entries.map((entry, index) =>
        entry.type === 'burst' ? (
          <ToolBurstTimelineItem
            key={keys[index]}
            burst={entry}
            entryId={keys[index]!}
            view={view}
            authorizations={authorizations}
            onOpenActions={onOpenActions}
          />
        ) : entry.item.kind === 'interaction' ? (
          <InteractionTimelineItem key={keys[index]} item={entry.item} />
        ) : (
          <ToolTimelineItem
            key={keys[index]}
            item={entry.item}
            permission={authorizations.get(entry.item.workId)}
            onOpenActions={onOpenActions}
          />
        ),
      )}
    </Timeline>
  );
}
