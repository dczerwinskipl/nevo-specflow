import { Fragment, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Icon,
  IconButton,
  ItemTabs,
  Menu,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  WorkspaceHeader,
  cn,
  getItemTabId,
  getItemTabPanelId,
  type ItemTab,
  type WorkspaceHeaderAction,
} from '@nevo/ui';
import type { TabAction, TabContent, TabContentProvider } from './types.stories-support';
import type { TabHost } from './useTabHost.stories-support';

/** One 56px pane header, the same frame the real workspace draws. */
export function PaneHeader({
  leading,
  trailing,
  children,
  bordered = true,
}: {
  leading?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
  bordered?: boolean;
}) {
  return (
    <div
      className={cn(
        '@container flex h-14 shrink-0 items-center gap-2',
        bordered ? 'border-b border-border-subtle px-4' : 'px-3',
      )}
    >
      {leading}
      <div className="min-w-0 flex-1">{children}</div>
      {trailing}
    </div>
  );
}

const noop = () => undefined;

export function tabsOf(host: TabHost, content: TabContentProvider): ItemTab[] {
  return host.open.map((id) => {
    const item = content(id);

    return {
      id,
      label: item.label,
      description: item.path,
      icon: 'file',
      dirty: item.dirty,
      state: item.state,
    };
  });
}

/* ------------------------------------------------------------------------------------------ */
/* Action slot: direct budget + the `...` menu                                                  */
/* ------------------------------------------------------------------------------------------ */

const directRank = (action: TabAction) =>
  action.tone === 'danger' || action.direct === 'never'
    ? null
    : action.direct === 'always'
      ? 0
      : action.primary
        ? 1
        : action.direct === 'wide'
          ? 2
          : null;

/** Same policy as WorkspaceHeader (always, then primary, then wide; primary shown last). */
function splitActions(actions: readonly TabAction[], budget: number) {
  const chosen = new Set(
    actions
      .map((action, index) => ({ index, rank: directRank(action) }))
      .filter((entry): entry is { index: number; rank: number } => entry.rank !== null)
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .slice(0, budget)
      .map((entry) => entry.index),
  );
  const picked = actions.filter((_, index) => chosen.has(index));

  return {
    direct: [...picked.filter((a) => !a.primary), ...picked.filter((a) => a.primary)],
    overflow: actions.filter((_, index) => !chosen.has(index)),
  };
}

function MenuEntry({ action }: { action: TabAction }) {
  const toggle = action.checked !== undefined;

  return (
    <MenuItem
      disabled={action.disabled}
      leadingIcon={action.icon}
      tone={action.tone ?? 'neutral'}
      onSelect={action.onPress}
      {...(toggle ? { role: 'menuitemcheckbox', 'aria-checked': action.checked } : {})}
      shortcut={
        toggle ? (
          action.checked ? (
            <Icon name="check" size="sm" />
          ) : (
            <span aria-hidden="true" className="inline-block size-icon-sm" />
          )
        ) : (
          action.shortcut
        )
      }
    >
      {action.label}
    </MenuItem>
  );
}

/**
 * The `...` menu, two DS groups with section labels: Display (toggles; the check sits in the
 * trailing column, the leading icon always names the setting) on top, Actions below (leading icon
 * = the action, trailing = shortcut). An empty group renders nothing, not even its separator.
 */
function ActionsMenu({ actions, label }: { actions: readonly TabAction[]; label: string }) {
  const groups = [
    { name: 'Display', items: actions.filter((action) => action.group === 'display') },
    { name: 'Actions', items: actions.filter((action) => action.group !== 'display') },
  ].filter((group) => group.items.length > 0);
  if (groups.length === 0) {
    return null;
  }

  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton aria-label={label} icon="ellipsis" size="sm" variant="ghost" />
      </MenuTrigger>
      <MenuContent align="end" aria-label={label} className="w-60">
        {groups.map((group, index) => (
          <Fragment key={group.name}>
            {index > 0 ? <MenuSeparator /> : null}
            <MenuGroup>
              <MenuLabel>{group.name}</MenuLabel>
              {group.items.map((action) => (
                <MenuEntry key={action.id} action={action} />
              ))}
            </MenuGroup>
          </Fragment>
        ))}
      </MenuContent>
    </Menu>
  );
}

/** Region actions every tab has: they belong to the host, not to the content. */
function hostActions(host: TabHost, id: string): TabAction[] {
  return [
    { id: 'path', label: 'Show path', icon: 'file-search', onPress: noop },
    { id: 'close', label: 'Close tab', icon: 'close', onPress: () => host.requestClose(id) },
  ];
}

function ActionSlot({
  host,
  item,
  id,
  budget,
  title,
  identity,
}: {
  host: TabHost;
  item: TabContent;
  id: string;
  budget: number;
  title: string;
  identity?: ReactNode;
}) {
  const all = [...item.actions(), ...hostActions(host, id)];
  const { direct, overflow } = splitActions(all, budget);
  // A primary action that is direct (Save) also stays reachable in the menu, with its shortcut.
  const inMenu = [...direct.filter((action) => action.primary), ...overflow];

  return (
    <div className="flex items-center gap-1.5">
      <div className="min-w-0 flex-1">
        <WorkspaceHeader
          title={title}
          identityContent={identity}
          actions={direct.map((a): WorkspaceHeaderAction => ({
            ...a,
            direct: 'always',
            // The tooltip names the shortcut, the menu shows it in the trailing column.
            label: a.shortcut ? `${a.label} (${a.shortcut})` : a.label,
          }))}
          labels={{ moreActions: 'More actions' }}
        />
      </div>
      <ActionsMenu actions={inMenu} label="More actions" />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Header, body, narrow header, dirty-close dialog                                              */
/* ------------------------------------------------------------------------------------------ */

/** The 56px header of the host: strip + the active tab's action slot (+ optional Back/Close). */
export function TabHostHeader({
  host,
  content,
  scope,
  label,
  budget,
  leading,
  trailing,
}: {
  host: TabHost;
  content: TabContentProvider;
  scope: string;
  label: string;
  /** Direct actions that fit (Wide 2, Narrow 1). */
  budget: number;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  const tabs = tabsOf(host, content);
  const id = host.active;

  return (
    <PaneHeader leading={leading} trailing={trailing}>
      {id && tabs.length > 0 ? (
        <ActionSlot
          host={host}
          item={content(id)}
          id={id}
          budget={budget}
          title={content(id).label}
          identity={
            <ItemTabs
              items={tabs}
              activeId={id}
              onActivate={host.setActive}
              onClose={host.requestClose}
              scope={scope}
              variant="strip"
              labels={{
                tablist: label,
                openedMenu: (count) => `Opened files (${count})`,
                openedHeading: 'Opened files',
                menuHint: 'Delete closes the highlighted file.',
              }}
            />
          }
        />
      ) : (
        <h2 className="sr-only">{label}</h2>
      )}
    </PaneHeader>
  );
}

export function TabHostBody({
  host,
  content,
  scope,
  empty,
  panelled = true,
}: {
  host: TabHost;
  content: TabContentProvider;
  scope: string;
  empty: ReactNode;
  /** False where no strip exists (stacked): the body is a plain region. */
  panelled?: boolean;
}) {
  const id = host.active;
  if (id === null) {
    return <>{empty}</>;
  }

  const item = content(id);
  const panel = panelled
    ? {
        role: 'tabpanel' as const,
        id: getItemTabPanelId(scope, id),
        'aria-labelledby': getItemTabId(scope, id),
      }
    : { role: 'region' as const, 'aria-label': item.label };

  return (
    <div key={id} {...panel} className="flex h-full min-h-0 flex-col">
      {item.render()}
    </div>
  );
}

/** Stacked header: Back, the name button opening Opened, and the same action slot (1 direct). */
export function TabHostNarrowHeader({
  host,
  content,
  onBack,
}: {
  host: TabHost;
  content: TabContentProvider;
  onBack: () => void;
}) {
  const tabs = tabsOf(host, content);
  const current = tabs.find((tab) => tab.id === host.active);
  const opened = (
    <ItemTabs
      items={tabs}
      activeId={host.active}
      onActivate={host.setActive}
      onClose={host.requestClose}
      scope="narrow"
      variant="switcher"
      labels={{
        openedMenu: () => 'Opened files',
        openedHeading: 'Opened files',
        menuHint: 'Delete closes the highlighted file.',
        noItem: 'No document',
        switcher: ({ label, count, dirty }) =>
          `${label}${dirty ? ', unsaved changes' : ''}, ${count} opened`,
      }}
    />
  );

  return (
    <PaneHeader
      bordered={false}
      leading={
        <IconButton
          aria-label="Back to documents"
          className="[&_svg]:rotate-180"
          icon="arrow-right"
          onClick={onBack}
          variant="ghost"
        />
      }
    >
      <h1 className="sr-only">{current?.label ?? 'Document'}</h1>
      {host.active ? (
        <ActionSlot
          host={host}
          item={content(host.active)}
          id={host.active}
          budget={1}
          title={current?.label ?? 'Document'}
          identity={opened}
        />
      ) : null}
    </PaneHeader>
  );
}

export function UnsavedChangesDialog({
  host,
  content,
}: {
  host: TabHost;
  content: TabContentProvider;
}) {
  const target = host.pendingClose ? content(host.pendingClose).label : '';

  return (
    <AlertDialog
      open={host.pendingClose !== null}
      onOpenChange={(open) => {
        if (!open) {
          host.cancelClose();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
          <AlertDialogDescription>
            {target} has unsaved changes. Save them before closing the tab?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="secondary">Cancel</Button>
          </AlertDialogCancel>
          <Button variant="destructive" onClick={() => host.confirmClose('discard')}>
            Discard
          </Button>
          <Button onClick={() => host.confirmClose('save')}>Save</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
