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
      // One line while both fit (down to 320 px): the hint takes the free space and wraps when long,
      // the button stays at the end. A label too long for the row moves the button to its own line,
      // where its label wraps instead of overflowing.
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 @lg:gap-x-4"
    >
      <div className="min-w-0 flex-1 basis-28">
        {prerequisite ? (
          <InlineNote id={prerequisiteId}>{prerequisite}</InlineNote>
        ) : (
          <InlineNote icon={null}>{note}</InlineNote>
        )}
      </div>
      <div className="min-w-0 max-w-full">
        <Button
          ref={submitRef}
          type="submit"
          aria-describedby={prerequisite ? prerequisiteId : undefined}
          disabled={submitDisabled}
        >
          {submitLabel}
        </Button>
      </div>
    </footer>
  );
}
