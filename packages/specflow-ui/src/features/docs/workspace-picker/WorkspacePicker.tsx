import { useRef, useState } from 'react';
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
 * changes mean is said once, under the list. Presentational: the list comes from the shared workspaces read
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
