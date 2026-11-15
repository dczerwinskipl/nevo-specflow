import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@nevo/ui';
import { outlineColumnWidth } from './markdownOutline';

/** The gap before each column beside the text (px). */
const columnGap = 32;

/**
 * The reading arrangement of a rendered document inside its padded scroll panel, one geometry for
 * every reading surface:
 * - with a column (`aside`, `extraColumn`), the text keeps its readable measure and the columns
 *   stay in view beside it, each `outlineColumnWidth(panelWidth)` wide after a 32 px gap; the group
 *   is centred, so a wider panel gets two equal outer gutters instead of one empty band;
 * - without one, the text alone at its readable measure, centred.
 * `lead` is the first line of the content (a note), in the flow above the text. A heading reached
 * with a pointer drops its focus ring (`useHeadingNavigation`).
 */
export function DocumentReadingColumns({
  panelWidth,
  lead,
  text,
  aside,
  extraColumn,
}: {
  /** The width of the scroll panel (px, measured): it sizes the columns. */
  panelWidth: number;
  lead?: ReactNode;
  text: ReactNode;
  /** The sticky column beside the text (Properties and Contents); none on a narrow panel. */
  aside?: ReactNode;
  /** A further column after it, as wide as the first (it sizes and positions itself). */
  extraColumn?: ReactNode;
}) {
  const { t } = useTranslation();
  const columnWidth = outlineColumnWidth(panelWidth);
  const leadBlock = lead ? <div className="mb-4">{lead}</div> : null;
  const quietFocus = '[&_[data-quiet-focus=pointer]]:outline-none';
  if (!aside && !extraColumn) {
    return (
      <div className={cn('mx-auto max-w-content-narrow', quietFocus)}>
        {leadBlock}
        {text}
      </div>
    );
  }

  const besideWidth =
    (aside ? columnWidth + columnGap : 0) + (extraColumn ? columnWidth + columnGap : 0);

  return (
    <div
      className={cn('mx-auto flex items-start gap-8', quietFocus)}
      style={{ maxWidth: `calc(var(--spacing-content-narrow) + ${besideWidth}px)` }}
    >
      <div className="min-w-0 max-w-content-narrow flex-1">
        {leadBlock}
        {text}
      </div>
      {aside && (
        <aside
          aria-label={t('documentReading.outline.columnLabel')}
          className="sticky top-0 grid shrink-0 grid-cols-1 gap-4"
          style={{ width: columnWidth }}
        >
          {aside}
        </aside>
      )}
      {extraColumn}
    </div>
  );
}
