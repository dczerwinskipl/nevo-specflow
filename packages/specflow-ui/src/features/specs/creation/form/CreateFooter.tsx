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
  onBlockedActivate,
  blockedActionLabel,
}: {
  submitRef?: RefObject<HTMLButtonElement | null>;
  /** Translated reason Create is unavailable; undefined shows `note` instead. */
  prerequisite: string | undefined;
  note: string;
  submitLabel: string;
  submitDisabled: boolean;
  /** PROTOTYPE (`proto.guide=on`): a blocked Create stays focusable and leads to the first problem. */
  onBlockedActivate?: () => void;
  blockedActionLabel?: string;
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
        {prerequisite && onBlockedActivate && submitDisabled ? (
          <span className="flex flex-wrap items-center gap-x-2">
            <InlineNote id={prerequisiteId}>{prerequisite}</InlineNote>
            <Button variant="ghost" size="sm" type="button" onClick={onBlockedActivate}>
              {blockedActionLabel}
            </Button>
          </span>
        ) : prerequisite ? (
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
          disabled={onBlockedActivate ? undefined : submitDisabled}
          aria-disabled={onBlockedActivate && submitDisabled ? true : undefined}
          onClick={
            onBlockedActivate && submitDisabled
              ? (event) => {
                  // Enter in a field and a click both arrive here: never submit, lead to the problem.
                  event.preventDefault();
                  onBlockedActivate();
                }
              : undefined
          }
        >
          {submitLabel}
        </Button>
      </div>
    </footer>
  );
}
