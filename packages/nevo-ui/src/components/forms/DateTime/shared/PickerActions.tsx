import { Button } from '../../../actions/Button';

export interface PickerActionLabels {
  cancel: string;
  done: string;
  now?: string;
}

export interface PickerActionsProps {
  labels: PickerActionLabels;
  onCancel: () => void;
  onDone: () => void;
  onNow?: () => void;
}

export function PickerActions({ labels, onCancel, onDone, onNow }: PickerActionsProps) {
  return (
    <div className="flex items-center gap-2 border-t border-border-subtle pt-3">
      {onNow && labels.now ? (
        <Button className="mr-auto" size="sm" variant="ghost" onClick={onNow}>
          {labels.now}
        </Button>
      ) : (
        <span className="mr-auto" aria-hidden="true" />
      )}
      <Button size="sm" variant="ghost" onClick={onCancel}>
        {labels.cancel}
      </Button>
      <Button size="sm" variant="primary" onClick={onDone}>
        {labels.done}
      </Button>
    </div>
  );
}
