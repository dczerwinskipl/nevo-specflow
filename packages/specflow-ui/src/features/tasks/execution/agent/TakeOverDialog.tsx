import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Typography,
} from '@nevo/ui';
import { focusInitial } from '../focusInitial';
import { WorkflowRefusalAlert } from '../WorkflowRefusalAlert';

const MONO = 'font-mono text-content-primary [overflow-wrap:anywhere]';
const PATHS_SHOWN = 5;

export interface TakeOverDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly stepTitle: string;
  /** The number of the attempt the owner's own starts as. */
  readonly nextAttempt: number;
  /** The files the agent left uncommitted: they stay. */
  readonly paths: readonly string[];
  readonly sessionTitle: string;
  readonly pending: boolean;
  readonly error: unknown;
  readonly onConfirm: () => void;
}

/**
 * Take over a stopped agent's attempt: the agent's attempt ends as taken over and the owner's own
 * starts. Nothing the agent wrote is undone or committed; the dialog lists what stays.
 */
export function TakeOverDialog({
  open,
  onOpenChange,
  stepTitle,
  nextAttempt,
  paths,
  sessionTitle,
  pending,
  error,
  onConfirm,
}: TakeOverDialogProps) {
  const { t } = useTranslation();
  const shown = paths.slice(0, PATHS_SHOWN);
  const more = paths.length - shown.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')} onOpenAutoFocus={focusInitial}>
        <DialogHeader>
          <DialogTitle>
            {t('workflowExecution.agentAttempt.takeOverDialog.title', { step: stepTitle })}
          </DialogTitle>
          <DialogDescription>
            {t('workflowExecution.agentAttempt.takeOverDialog.description', {
              attempt: nextAttempt,
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-6">
            {error ? <WorkflowRefusalAlert error={error} /> : null}
            <section className="grid min-w-0 gap-2">
              <div className="grid gap-0.5">
                <Typography as="h3" variant="label-sm">
                  {t('workflowExecution.agentAttempt.takeOverDialog.stays')}
                </Typography>
                <Typography as="p" variant="body-sm" className="text-content-secondary">
                  {t('workflowExecution.agentAttempt.takeOverDialog.staysBody')}
                </Typography>
              </div>
              {shown.length > 0 ? (
                <ul className="grid list-disc gap-0.5 pl-5 text-body-sm marker:text-content-muted">
                  {shown.map((path) => (
                    <li key={path} className={MONO}>
                      {path}
                    </li>
                  ))}
                  {more > 0 ? (
                    <li className="list-none text-content-muted">
                      {t('workflowExecution.agent.blocker.dirty.more', { count: more })}
                    </li>
                  ) : null}
                </ul>
              ) : (
                <Typography as="p" variant="body-sm" className="text-content-secondary">
                  {t('workflowExecution.agentAttempt.takeOverDialog.noFiles')}
                </Typography>
              )}
            </section>
            <Typography as="p" variant="body-sm" className="text-content-secondary">
              {t('workflowExecution.agentAttempt.takeOverDialog.session', { title: sessionTitle })}
            </Typography>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button data-initial-focus="" variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onConfirm} disabled={pending} aria-busy={pending}>
            {pending
              ? t('workflowExecution.agentAttempt.takingOver')
              : t('workflowExecution.agentAttempt.takeOver')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
