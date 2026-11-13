import { useTranslation } from 'react-i18next';
import { IconButton, Typography, cn, hitAreaClassName } from '@nevo/ui';
import { markdownOutline } from '../../../shared/document-reading/markdownOutline';
import { useArticleChromeOf } from './articleChrome';

/** The article has a Contents list worth showing: at least two headings. */
export const hasContents = (body: string | undefined) =>
  body !== undefined && markdownOutline(body).length > 1;

/**
 * The header identity of an article: its title (one line, full title in the tooltip) and, while
 * the panel is too narrow for the contents column, the Contents button that opens the sheet. A
 * problem state (no body) has no Contents.
 */
export function ArticleTitle({
  chromeKey,
  title,
  contents,
}: {
  chromeKey: string;
  title: string;
  /** The article's body has a Contents list (see `hasContents`). */
  contents: boolean;
}) {
  const { t } = useTranslation();
  const { store, column, sheetOpen } = useArticleChromeOf(chromeKey);

  return (
    <span className="flex min-w-0 items-center gap-1">
      <Typography as="h2" variant="title-sm" className="min-w-0 truncate" title={title}>
        {title}
      </Typography>
      {contents && !column && (
        <IconButton
          icon="list"
          size="sm"
          variant="ghost"
          aria-label={t('documentReading.outline.open')}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          title={t('documentReading.outline.label')}
          className={cn('shrink-0', hitAreaClassName)}
          onClick={(event) => store.openSheet(chromeKey, event.currentTarget)}
        />
      )}
    </span>
  );
}
