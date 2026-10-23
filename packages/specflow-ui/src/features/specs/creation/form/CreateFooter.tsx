import { useId, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, InlineNote } from '@nevo/ui';

/**
 * Footer of the Create form: the region for the failure alert and progress, the one reason Create
 * is unavailable (or the note about what Create does) and the submit button.
 */
export function CreateFooter({
  actionRegion,
  submitRef,
  failureAlert,
  prerequisite,
  note,
  submitLabel,
  submitDisabled,
}: {
  actionRegion?: RefObject<HTMLDivElement | null>;
  submitRef?: RefObject<HTMLButtonElement | null>;
  failureAlert: ReactNode;
  /** Translated reason Create is unavailable; undefined shows `note` instead. */
  prerequisite: string | undefined;
  note: string;
  submitLabel: string;
  submitDisabled: boolean;
}) {
  const { t } = useTranslation();
  const prerequisiteId = useId();
  return (
    <div
      ref={actionRegion}
      role="group"
      className="grid gap-4 pb-2"
      aria-label={t('create.formRegion')}
    >
      {failureAlert}
      <footer className="flex flex-col gap-3 @lg:flex-row @lg:items-center @lg:justify-between">
        {prerequisite ? (
          <InlineNote id={prerequisiteId}>{prerequisite}</InlineNote>
        ) : (
          <InlineNote icon={null}>{note}</InlineNote>
        )}
        <div className="w-full @lg:w-auto @lg:shrink-0">
          <Button
            ref={submitRef}
            type="submit"
            width="full"
            aria-describedby={prerequisite ? prerequisiteId : undefined}
            disabled={submitDisabled}
          >
            {submitLabel}
          </Button>
        </div>
      </footer>
    </div>
  );
}
