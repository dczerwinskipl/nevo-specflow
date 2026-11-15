import { useCallback, useRef, useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent, ScrollArea, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { WorkspaceList } from '@nevo/specflow-contracts/workspaces';
import { useMessage } from '../../../i18n/message';
import {
  ContextSwitcherOption,
  ContextSwitcherTrigger,
  contextSwitcherPopoverClassName,
  useListboxKeys,
  type ContextSwitcherStatusValue,
} from '../../../shared/context-switcher';
import { workspaceUnavailableMessage } from '../../workspaces/read-model';
import { displayPath, workspaceFacts, type WorkspaceFacts } from './workspacePickerModel';

export interface WorkspacePickerProps {
  readonly workspaces: WorkspaceList;
  /** Precondition: a workspace of `workspaces` (the caller resolves fallbacks); throws otherwise. */
  readonly selectedWorkspaceId: string;
  readonly onSelect: (workspaceId: string) => void;
  /** The workspace the current Session runs in: the picker says "this Session's workspace". */
  readonly sessionWorkspaceId?: string;
}

/**
 * Picks one of the project's registered workspaces, in the Specification switcher's anatomy (the
 * shared context switcher): a subtle trigger (quiet label, one-line name, local changes or
 * unavailability in the status slot, kind line) opening a listbox of every workspace, focus on the
 * selected one; an unavailable workspace is listed with its reason and cannot be chosen. What local
 * changes mean is said once, under the list. Presentational: the list comes from the shared
 * workspaces read model. Renders nothing with a single workspace (there is nothing to tell apart).
 */
export function WorkspacePicker({
  workspaces,
  selectedWorkspaceId,
  onSelect,
  sessionWorkspaceId,
}: WorkspacePickerProps) {
  const { t } = useTranslation();
  const text = useMessage();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const { options, onOptionKeyDown } = useListboxKeys(panel);
  // A long selected name can sit below the list's fold, and the list only settles its height after
  // opening (the popover is fitted to the space left): keep the focused option whole. The list
  // mounts with the portalled popover, so it is observed from its ref, not from an effect.
  const listObserver = useRef<ResizeObserver | null>(null);
  const observeList = useCallback((viewport: HTMLDivElement | null) => {
    listObserver.current?.disconnect();
    listObserver.current = null;
    if (viewport && typeof ResizeObserver !== 'undefined') {
      listObserver.current = new ResizeObserver(() => revealFocusedOption(viewport));
      listObserver.current.observe(viewport);
    }
  }, []);
  const list = workspaces.workspaces;
  if (list.length < 2) {
    return null;
  }

  const current = list.find((w) => w.workspaceId === selectedWorkspaceId);
  if (!current) {
    throw new Error(
      `WorkspacePicker: selected workspace ${selectedWorkspaceId} is not in the list`,
    );
  }

  const projectFolderPath = list.find((w) => w.workspaceId === workspaces.projectFolderId)?.path;

  const segments = (facts: WorkspaceFacts, withSession: boolean) => [
    facts.kind === 'projectFolder'
      ? t('workspacePicker.projectFolder')
      : t('workspacePicker.worktree'),
    ...(facts.specifications.length ? [facts.specifications.join(', ')] : []),
    ...(withSession && facts.sessionWorkspace ? [t('workspacePicker.sessionWorkspace')] : []),
  ];

  const status = ({ status }: WorkspaceFacts): ContextSwitcherStatusValue | undefined =>
    status?.kind === 'unavailable'
      ? { tone: 'danger', text: text(workspaceUnavailableMessage(status.reason)) }
      : status?.kind === 'localChanges'
        ? { tone: 'attention', text: t('workspacePicker.localChanges') }
        : undefined;

  const currentFacts = workspaceFacts(current, sessionWorkspaceId);
  const listed = list.map((workspace) => ({
    workspace,
    facts: workspaceFacts(workspace, sessionWorkspaceId),
  }));

  return (
    <div className="rounded-control bg-surface-subtle">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <ContextSwitcherTrigger
            ref={trigger}
            aria-description={t('workspacePicker.change')}
            note={displayPath(current.path, projectFolderPath)}
            label={t('workspacePicker.label')}
            name={current.name}
            segments={segments(currentFacts, true)}
            status={status(currentFacts)}
          />
        </PopoverTrigger>
        <PopoverContent
          inert={!open}
          aria-hidden={!open}
          ref={panel}
          motion="navigation"
          align="start"
          aria-label={t('workspacePicker.change')}
          className={contextSwitcherPopoverClassName}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const all = options();
            const option = all.find((o) => o.getAttribute('aria-selected') === 'true') ?? all[0];
            option?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus({ preventScroll: true });
          }}
        >
          <ScrollArea
            className="flex min-h-0 max-h-72 flex-col"
            viewportRef={observeList}
            tabIndex={-1}
            contentClassName="grid gap-1"
          >
            <div
              role="listbox"
              aria-label={t('workspacePicker.list')}
              className="relative grid gap-1"
            >
              {listed.map(({ workspace, facts }) => {
                const selected = workspace.workspaceId === current.workspaceId;

                return (
                  <ContextSwitcherOption
                    key={workspace.workspaceId}
                    name={workspace.name}
                    segments={segments(facts, false)}
                    status={status(facts)}
                    selected={selected}
                    unavailable={!workspace.available}
                    title={displayPath(workspace.path, projectFolderPath)}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => {
                      if (workspace.available) {
                        onSelect(workspace.workspaceId);
                        setOpen(false);
                      }
                    }}
                    onKeyDown={onOptionKeyDown}
                  />
                );
              })}
            </div>
          </ScrollArea>
          {listed.some(({ facts }) => facts.status?.kind === 'localChanges') ? (
            <Typography
              as="p"
              variant="body-sm"
              className="mt-2 border-t border-divider px-2 pt-2 text-content-muted"
            >
              {t('workspacePicker.localChangesExplained')}
            </Typography>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * Scrolls the list (only) so its focused option shows whole. Layout offsets, not boxes: the popover
 * may still be animating in (scaled); the options' offset parent is the listbox at the list's top.
 */
function revealFocusedOption(viewport: HTMLElement) {
  const option = document.activeElement;
  if (!(option instanceof HTMLElement) || !viewport.contains(option)) {
    return;
  }

  const bottom = option.offsetTop + option.offsetHeight;
  if (bottom > viewport.scrollTop + viewport.clientHeight) {
    viewport.scrollTop = Math.min(option.offsetTop, bottom - viewport.clientHeight);
  } else if (option.offsetTop < viewport.scrollTop) {
    viewport.scrollTop = option.offsetTop;
  }
}
