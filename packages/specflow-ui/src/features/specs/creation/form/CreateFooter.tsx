import { useId, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, InlineNote } from '@nevo/ui';

/**
 * The pinned footer of the Create form (`CreateShell`'s `footer`, always visible under the
 * scrolling form): the one reason Create is unavailable (or the note about what Create does) and the
 * submit button. Failure alerts belong to the end of the form, not here, so the footer stays one
 * compact line.
 */
export function CreateFooter({
  submitRef,
  prerequisite,
  note,
  submitLabel,
  submitDisabled,
}: {
  submitRef?: RefObject<HTMLButtonElement | null>;
  /** Translated reason Create is unavailable; undefined shows `note` instead. */
  prerequisite: string | undefined;
  note: string;
  submitLabel: string;
  submitDisabled: boolean;
}) {
  const { t } = useTranslation();
  const prerequisiteId = useId();
  return (
    <footer
      role="group"
      aria-label={t('create.formRegion')}
      className="flex flex-col gap-2 @lg:flex-row @lg:items-center @lg:justify-between @lg:gap-4"
    >
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
  );
}
