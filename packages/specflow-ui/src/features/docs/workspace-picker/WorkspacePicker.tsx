import { useRef, useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  Icon,
  Typography,
  ScrollArea,
  cn,
} from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { WorkspaceList, WorkspaceListItem } from '@nevo/specflow-contracts/workspaces';
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
 * Picks one of the project's registered workspaces, in the Specification switcher's anatomy: a
 * subtle trigger (quiet label, wrapping name, kind line) opening a listbox of every workspace.
 * Presentational: the list comes from the shared workspaces read model. Renders nothing with a
 * single workspace (there is nothing to tell apart).
 */
export function WorkspacePicker({
  workspaces,
  selectedWorkspaceId,
  onSelect,
  sessionWorkspaceId,
}: WorkspacePickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
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
  const options = () => panel.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [];

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

  return (
    <div className="rounded-control bg-surface-subtle">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            ref={trigger}
            type="button"
            aria-description={t('workspacePicker.change')}
            title={displayPath(current.path, projectFolderPath)}
            className="relative block min-h-11 w-full rounded-control px-3 py-2 text-left outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring"
          >
            <Typography as="span" variant="body-sm" className="mb-1 block pr-5 text-content-muted">
              {t('workspacePicker.label')}
            </Typography>
            <Typography
              as="span"
              variant="title-sm"
              className="block pr-5 text-content-primary [overflow-wrap:anywhere]"
            >
              {current.name}
            </Typography>
            <Typography as="span" variant="body-sm" className="block text-content-secondary">
              {describe(current, true)}
            </Typography>
            {current.dirty ? (
              <Typography as="span" variant="body-sm" className="block text-content-muted">
                {t('workspacePicker.dirty')}
              </Typography>
            ) : null}
            <Icon name={ChevronsUpDown} size="sm" className="absolute right-3 top-2" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          ref={panel}
          align="start"
          aria-label={t('workspacePicker.change')}
          className="w-80 max-w-[calc(100vw-2rem)] p-2"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const all = [...options()];
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
              {list.map((workspace, index) => {
                const selected = workspace.workspaceId === current.workspaceId;
                const available = workspace.available;

                return (
                  <button
                    key={workspace.workspaceId}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    aria-disabled={!available || undefined}
                    title={displayPath(workspace.path, projectFolderPath)}
                    tabIndex={selected ? 0 : -1}
                    className={cn(
                      'flex min-h-11 items-start gap-2 rounded-control px-2 py-2 text-left outline-none focus-visible:outline-2 focus-visible:outline-focus-ring aria-selected:bg-surface-selected',
                      available ? 'hover:bg-surface-hover' : 'cursor-not-allowed',
                    )}
                    onClick={() => {
                      if (available) {
                        onSelect(workspace.workspaceId);
                        setOpen(false);
                      }
                    }}
                    onKeyDown={(event) => {
                      const all = options();
                      const next =
                        event.key === 'ArrowDown'
                          ? (index + 1) % all.length
                          : event.key === 'ArrowUp'
                            ? (index - 1 + all.length) % all.length
                            : event.key === 'Home'
                              ? 0
                              : event.key === 'End'
                                ? all.length - 1
                                : undefined;
                      if (next !== undefined) {
                        event.preventDefault();
                        all[next]?.focus();
                      }
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <Typography
                        as="span"
                        variant="title-sm"
                        className={cn(
                          'block [overflow-wrap:anywhere]',
                          available ? 'text-content-primary' : 'text-content-muted',
                        )}
                      >
                        {workspace.name}
                      </Typography>
                      <Typography
                        as="span"
                        variant="body-sm"
                        className={cn(
                          'block',
                          available ? 'text-content-secondary' : 'text-status-attention',
                        )}
                      >
                        {available || !workspace.unavailableReason
                          ? describe(workspace, false)
                          : t(`workspacePicker.unavailable.${workspace.unavailableReason}`)}
                      </Typography>
                      {selected ? (
                        <Typography
                          as="span"
                          variant="body-sm"
                          className="block text-content-secondary"
                        >
                          {t('workspacePicker.selected')}
                        </Typography>
                      ) : null}
                    </span>
                    {selected ? <Icon name="check" size="sm" /> : null}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}
