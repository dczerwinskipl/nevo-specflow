import { Typography } from '@nevo/ui';
import { TextAction } from '../../../shared/actions';

/**
 * What still holds the start, as a count with its way to the details ("2 dependencies remaining ·
 * View dependencies"): the primary-content line that closes the Now block's state when its lead is
 * an actionable readiness ("Waiting for dependencies").
 */
export function ReadinessLine({
  text,
  action,
}: {
  readonly text: string;
  readonly action?: { readonly label: string; readonly onPress: () => void } | undefined;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1" data-now-readiness="">
      <Typography as="p" variant="body-md" className="text-content-primary">
        {text}
      </Typography>
      {action ? (
        <TextAction chevron="navigate" className="text-body-md" onClick={action.onPress}>
          {action.label}
        </TextAction>
      ) : null}
    </div>
  );
}
