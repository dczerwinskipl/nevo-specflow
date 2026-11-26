import { useState, type ReactNode } from 'react';
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
import { ItemPicker, type PickerItem } from '../picker/ItemPicker';
import type { DependencyCandidate } from './dependencyModel';

export interface AddDependencyDialogProps {
  /** The Task the dependencies are added to, by its title. */
  readonly taskTitle: string;
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
 * Add dependencies: the shared picker ({@link ItemPicker}) over the Engine's candidates, each Task
 * by its title; the ones that cannot be added (already a dependency, a cycle, cancelled, broken)
 * under the collapsed "Unavailable tasks" with their reason. The confirm names the count.
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
  taskTitle,
  onOpenChange,
  candidates,
  pending,
  error,
  onAdd,
}: AddDependencyDialogProps) {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const items: PickerItem[] = candidates.map((candidate) => ({
    id: candidate.task.id,
    title: candidate.task.title,
    searchText: candidate.task.id,
    ...(candidate.unavailable === undefined
      ? candidate.task.statusLabel
        ? { description: candidate.task.statusLabel }
        : {}
      : {
          unavailable: t(`taskAuthoring.dependencies.unavailable.${candidate.unavailable}`),
          added: candidate.unavailable === 'dependency',
        }),
  }));

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('taskAuthoring.dependencies.dialogTitle')}</DialogTitle>
        <DialogDescription>
          {t('taskAuthoring.dependencies.dialogDescription', { title: taskTitle })}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="grid gap-4">
        {error}
        {candidates.length === 0 ? (
          <Typography as="p" variant="body-sm" className="text-content-secondary">
            {t('taskAuthoring.dependencies.noCandidates')}
          </Typography>
        ) : (
          <ItemPicker
            items={items}
            picked={chosen}
            onToggle={(id, checked) =>
              setChosen((current) =>
                checked ? [...current, id] : current.filter((other) => other !== id),
              )
            }
            labels={{
              available: t('taskAuthoring.picker.availableTasks'),
              unavailable: t('taskAuthoring.picker.unavailableTasks'),
              noneAvailable: t('taskAuthoring.dependencies.noneAvailable'),
              search: t('taskAuthoring.picker.searchTasks'),
            }}
          />
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          {t('common.cancel')}
        </Button>
        <Button disabled={chosen.length === 0 || pending} onClick={() => onAdd(chosen)}>
          {chosen.length === 0
            ? t('taskAuthoring.dependencies.confirmNone')
            : t('taskAuthoring.dependencies.confirm', { count: chosen.length })}
        </Button>
      </DialogFooter>
    </>
  );
}
