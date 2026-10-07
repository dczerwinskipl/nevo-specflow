import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Typography,
} from '@nevo/ui';
import { useTranslation } from 'react-i18next';

export interface ExecuteModalProps {
  readonly open: boolean;
  readonly selectedTasks: readonly string[];
  readonly onClose: () => void;
  readonly onExecute: (agent: string) => void;
}

export function ExecuteModal({ open, selectedTasks, onClose, onExecute }: ExecuteModalProps) {
  const { t } = useTranslation();
  const [agent, setAgent] = useState('Implementer');

  const blocked = selectedTasks.filter((id) =>
    ['TASK-01', 'TASK-02', 'TASK-03', 'TASK-04', 'TASK-06'].includes(id),
  );
  const isBlocked = blocked.length > 0;
  const hasWarning = selectedTasks.includes('TASK-05') && !isBlocked;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('specification.executeModalTitle')}</DialogTitle>
        </DialogHeader>

        <DialogBody className="grid gap-4 py-2">
          <Typography variant="body-sm" className="text-content-secondary">
            {t('specification.executeScopeLabel', { tasks: selectedTasks.join(', ') })}
          </Typography>

          {isBlocked ? (
            <div className="rounded-control bg-status-danger/10 p-3 text-body-xs text-status-danger border border-status-danger/20">
              {t('specification.executeBlockedNotice', { tasks: blocked.join(', ') })}
            </div>
          ) : hasWarning ? (
            <div className="rounded-control bg-status-warning/10 p-3 text-body-xs text-status-warning border border-status-warning/20">
              {t('specification.executeWarningNotice')}
            </div>
          ) : null}

          <div className="grid gap-1.5">
            <label
              htmlFor="execute-agent-select"
              className="text-body-xs font-medium text-content-secondary"
            >
              {t('specification.agentSelectLabel')}
            </label>
            <select
              id="execute-agent-select"
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              className="rounded-control border border-border-default bg-surface-subtle px-3 py-2 text-body-sm text-content-primary focus-visible:outline-2 focus-visible:outline-focus-ring"
            >
              <option value="Implementer">Implementer</option>
              <option value="Reviewer">Reviewer</option>
            </select>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={isBlocked} onClick={() => onExecute(agent)}>
            {t('specification.openSessionAction')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
