import { useRef, useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent, ScrollArea } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { WorkspaceList, WorkspaceListItem } from '@nevo/specflow-contracts/workspaces';
import { useMessage } from '../../../i18n/message';
import {
  ContextSwitcherOption,
  ContextSwitcherTrigger,
  contextSwitcherPopoverClassName,
  useListboxKeys,
  type ContextSwitcherDetail,
} from '../../../shared/context-switcher';
import { workspaceUnavailableMessage } from '../../workspaces/read-model';
import { displayPath, kindLine } from './workspacePickerModel';

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
 * shared context switcher): a subtle trigger (quiet label, wrapping name, kind line) opening a
 * listbox of every workspace, focus on the selected one; an unavailable workspace is listed with
 * its reason and cannot be chosen. Presentational: the list comes from the shared workspaces read
 * model. Renders nothing with a single workspace (there is nothing to tell apart).
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

  const describe = (workspace: WorkspaceListItem, withSession: boolean) => {
    const { kind, specifications } = kindLine(workspace);
    const base =
      kind === 'projectFolder'
        ? t('workspacePicker.projectFolder')
        : [
            t('workspacePicker.worktree'),
            ...(specifications.length ? [specifications.join(', ')] : []),
          ].join(' · ');

    return withSession && workspace.workspaceId === sessionWorkspaceId
      ? `${base} · ${t('workspacePicker.sessionWorkspace')}`
      : base;
  };

  const optionDetail = (workspace: WorkspaceListItem): ContextSwitcherDetail =>
    workspace.available || !workspace.unavailableReason
      ? { text: describe(workspace, false) }
      : { text: text(workspaceUnavailableMessage(workspace.unavailableReason)), tone: 'attention' };

  return (
    <div className="rounded-control bg-surface-subtle">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <ContextSwitcherTrigger
            ref={trigger}
            aria-description={t('workspacePicker.change')}
            title={displayPath(current.path, projectFolderPath)}
            label={t('workspacePicker.label')}
            name={current.name}
            details={[
              { text: describe(current, true) },
              ...(current.dirty
                ? [{ text: t('workspacePicker.dirty'), tone: 'muted' } as const]
                : []),
            ]}
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
            (all.find((o) => o.getAttribute('aria-selected') === 'true') ?? all[0])?.focus({
              preventScroll: true,
            });
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus({ preventScroll: true });
          }}
        >
          <ScrollArea
            className="flex min-h-0 max-h-72 flex-col"
            tabIndex={-1}
            contentClassName="grid gap-1"
          >
            <div role="listbox" aria-label={t('workspacePicker.list')} className="grid gap-1">
              {list.map((workspace) => {
                const selected = workspace.workspaceId === current.workspaceId;

                return (
                  <ContextSwitcherOption
                    key={workspace.workspaceId}
                    name={workspace.name}
                    details={[optionDetail(workspace)]}
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
        </PopoverContent>
      </Popover>
    </div>
  );
}
