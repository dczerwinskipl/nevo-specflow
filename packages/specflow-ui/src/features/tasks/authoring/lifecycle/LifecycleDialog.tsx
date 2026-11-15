import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  TextArea,
} from '@nevo/ui';
import { RefusalAlert } from '../RefusalAlert';

export type LifecycleDecision = 'approve' | 'hold' | 'cancel' | 'remove';

export interface LifecycleDialogProps {
  readonly taskId: string;
  /** Undefined: closed. */
  readonly decision: LifecycleDecision | undefined;
  readonly missingContext: readonly string[];
  readonly pending: boolean;
  readonly error: unknown;
  readonly onConfirm: (reason: string) => void;
  readonly onClose: () => void;
}

/** The confirmation of a lifecycle decision: its consequence, a reason where one is recorded. */
export function LifecycleDialog(props: LifecycleDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={props.decision !== undefined} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent closeLabel={t('common.close')}>
        {props.decision ? <DecisionForm {...props} decision={props.decision} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function DecisionForm({
  taskId,
  decision,
  missingContext,
  pending,
  error,
  onConfirm,
  onClose,
}: LifecycleDialogProps & { decision: LifecycleDecision }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const copy = {
    approve: {
      title: t('taskAuthoring.lifecycle.approveTitle', { id: taskId }),
      description: t('taskAuthoring.lifecycle.approveDescription'),
      confirm: t('taskAuthoring.lifecycle.approve'),
    },
    hold: {
      title: t('taskAuthoring.lifecycle.holdTitle', { id: taskId }),
      description: t('taskAuthoring.lifecycle.holdDescription'),
      confirm: t('taskAuthoring.lifecycle.hold'),
    },
    cancel: {
      title: t('taskAuthoring.lifecycle.cancelTitle', { id: taskId }),
      description: t('taskAuthoring.lifecycle.cancelDescription'),
      confirm: t('taskAuthoring.lifecycle.cancel'),
    },
    remove: {
      title: t('taskAuthoring.lifecycle.removeTitle', { id: taskId }),
      description: t('taskAuthoring.lifecycle.removeDescription'),
      confirm: t('taskAuthoring.lifecycle.remove'),
    },
  }[decision];
  const withReason = decision === 'hold' || decision === 'cancel';
  const destructive = decision === 'cancel' || decision === 'remove';

  return (
    <>
      <DialogHeader>
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription>{copy.description}</DialogDescription>
      </DialogHeader>
      <DialogBody className="grid gap-4">
        {error ? <RefusalAlert error={error} /> : null}
        {decision === 'approve' && missingContext.length > 0 ? (
          <Alert
            tone="attention"
            title={t('taskAuthoring.lifecycle.approveMissing', {
              count: missingContext.length,
              names: missingContext.join(', '),
            })}
          >
            {t('taskAuthoring.lifecycle.approveMissingBody')}
          </Alert>
        ) : null}
        {withReason ? (
          <Field>
            <Field.Label>{t('taskAuthoring.lifecycle.reasonLabel')}</Field.Label>
            <TextArea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          {destructive ? t('taskAuthoring.lifecycle.keep') : t('common.cancel')}
        </Button>
        <Button
          variant={destructive ? 'destructive' : 'primary'}
          disabled={pending}
          onClick={() => onConfirm(reason.trim())}
        >
          {copy.confirm}
        </Button>
      </DialogFooter>
    </>
  );
}
