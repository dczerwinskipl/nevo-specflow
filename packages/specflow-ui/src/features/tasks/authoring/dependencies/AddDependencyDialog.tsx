import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  CheckboxField,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Typography,
} from '@nevo/ui';
import type { DependencyCandidate } from './dependencyModel';

export interface AddDependencyDialogProps {
  readonly taskId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly candidates: readonly DependencyCandidate[];
  readonly pending: boolean;
  /** The refusal of the last add, shown above the list. */
  readonly error?: ReactNode;
  /** The ids chosen now (added to the existing ones by the caller). */
  readonly onAdd: (ids: readonly string[]) => void;
}

/**
 * The dependency checklist: existing dependencies checked and disabled, a cycle disabled with
 * its reason. Nevo UI has no multi-select Combobox, so this is a checkbox list (UX contract).
 */
export function AddDependencyDialog(props: AddDependencyDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
        {props.open ? <Checklist {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Checklist({
  taskId,
  onOpenChange,
  candidates,
  pending,
  error,
  onAdd,
}: AddDependencyDialogProps) {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<readonly string[]>([]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('taskAuthoring.dependencies.dialogTitle', { id: taskId })}</DialogTitle>
        <DialogDescription>
          {t('taskAuthoring.dependencies.dialogDescription', { id: taskId })}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="grid gap-4">
        {error}
        {candidates.length === 0 ? (
          <Typography as="p" variant="body-sm" className="text-content-secondary">
            {t('taskAuthoring.dependencies.noCandidates')}
          </Typography>
        ) : (
          <fieldset className="grid gap-3">
            <legend className="sr-only">{t('taskAuthoring.dependencies.legend')}</legend>
            {candidates.map((candidate) => (
              <CheckboxField
                key={candidate.task.id}
                label={`${candidate.task.id} · ${candidate.task.title}`}
                description={
                  candidate.unavailable === undefined
                    ? candidate.task.statusLabel
                    : candidate.unavailable === 'dependency'
                      ? t('taskAuthoring.dependencies.existing')
                      : t(`taskAuthoring.dependencies.unavailable.${candidate.unavailable}`, {
                          other: candidate.task.id,
                          id: taskId,
                        })
                }
                checked={
                  candidate.unavailable === 'dependency' || chosen.includes(candidate.task.id)
                }
                disabled={candidate.unavailable !== undefined}
                onCheckedChange={(checked) =>
                  setChosen((current) =>
                    checked === true
                      ? [...current, candidate.task.id]
                      : current.filter((id) => id !== candidate.task.id),
                  )
                }
              />
            ))}
          </fieldset>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          {t('common.cancel')}
        </Button>
        <Button disabled={chosen.length === 0 || pending} onClick={() => onAdd(chosen)}>
          {t('taskAuthoring.dependencies.confirm')}
        </Button>
      </DialogFooter>
    </>
  );
}
