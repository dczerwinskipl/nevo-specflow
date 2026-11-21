import { useId, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, InlineNote } from '@nevo/ui';

/**
 * The pinned footer of the Create form (`CreateShell`'s `footer`, always visible under the
 * scrolling form): the one reason Create is unavailable (or the note about what Create does) and the
 * submit button. Failure alerts belong to the end of the form, not here, so the footer stays one
 * compact line.
 *
 * A Create blocked by the form's own values (`submitBlocked`) stays a focusable submit button marked
 * `aria-disabled`: activating it submits the form, whose owner then leads to the field instead of
 * sending anything. `onGuide` adds the same lead as a quiet action after the reason. Only an
 * operation in progress or a locked form disables the button (`submitDisabled`).
 */
export function CreateFooter({
  submitRef,
  prerequisite,
  note,
  submitLabel,
  submitDisabled,
  submitBlocked = false,
  onGuide,
  blockedDescriptionId,
}: {
  submitRef?: RefObject<HTMLButtonElement | null>;
  /** Translated reason Create is unavailable; undefined shows `note` instead. */
  prerequisite: string | undefined;
  note: string;
  submitLabel: string;
  submitDisabled: boolean;
  /** The form's values block Create: the button is announced unavailable but stays focusable. */
  submitBlocked?: boolean;
  /** Leads to the field that holds `prerequisite`; absent when no field can fix it. */
  onGuide?: () => void;
  blockedDescriptionId?: string;
}) {
  const { t } = useTranslation();
  const prerequisiteId = useId();

  return (
    <footer
      role="group"
      aria-label={t('create.formRegion')}
      // On very narrow surfaces the hint gets its own row, so actionable copy stays readable.
      // Otherwise the hint takes the free space and wraps when long,
      // the button stays at the end. A label too long for the row moves the button to its own line,
      // where its label wraps instead of overflowing.
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 @lg:gap-x-4"
    >
      <div className="flex min-w-0 flex-1 basis-28 @max-[22rem]/app-content:basis-full flex-wrap items-center gap-x-2 gap-y-1">
        {prerequisite ? (
          <>
            <InlineNote id={prerequisiteId} className="min-w-0">
              {prerequisite}
            </InlineNote>
            {onGuide ? (
              <Button variant="ghost" size="sm" onClick={onGuide}>
                {t('create.guide.goToField')}
              </Button>
            ) : null}
          </>
        ) : note ? (
          <InlineNote icon={null}>{note}</InlineNote>
        ) : null}
      </div>
      <div className="ml-auto min-w-0 max-w-full">
        <Button
          ref={submitRef}
          type="submit"
          aria-describedby={blockedDescriptionId ?? (prerequisite ? prerequisiteId : undefined)}
          aria-disabled={submitBlocked && !submitDisabled ? true : undefined}
          disabled={submitDisabled}
        >
          {submitLabel}
        </Button>
      </div>
    </footer>
  );
}
