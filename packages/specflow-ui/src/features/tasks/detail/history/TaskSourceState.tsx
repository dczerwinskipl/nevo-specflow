import { Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';

/** A part of the Task history that cannot be shown: its source is unavailable or forbidden. */
export function TaskSourceState({ state }: { readonly state: 'unavailable' | 'forbidden' }) {
  const { t } = useTranslation();

  return (
    <Typography as="div" variant="body-sm" className="text-content-muted">
      {t(
        state === 'forbidden'
          ? 'specification.resourceAccessDeniedDescription'
          : 'taskDetails.sourceUnavailable',
      )}
    </Typography>
  );
}
