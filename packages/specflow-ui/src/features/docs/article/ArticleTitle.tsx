import { Typography } from '@nevo/ui';
import { ContentsButton } from '../../../shared/document-reading/ContentsButton';
import { markdownOutline } from '../../../shared/document-reading/markdownOutline';
import { useArticleChromeOf } from './articleChrome';

/** The article has a Contents list worth showing: at least two headings. */
export const hasContents = (body: string | undefined) =>
  body !== undefined && markdownOutline(body).length > 1;

/**
 * The header identity of an article: its title (one line, full title in the tooltip) and, while
 * the panel is too narrow for the contents column, the Contents button that opens the sheet. The
 * button sits at the right end, just before the header's `...` menu, as the Documents preview puts
 * its Contents control beside its header actions. A problem state (no body) has no Contents.
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
  const { store, column, sheetOpen } = useArticleChromeOf(chromeKey);

  return (
    <span className="flex min-w-0 items-center gap-1">
      {/* The title takes the free width, so the Contents button stays at the right end. */}
      <Typography as="h2" variant="title-sm" className="min-w-0 flex-1 truncate" title={title}>
        {title}
      </Typography>
      {contents && !column && (
        // 8 px from the `...` menu (the header's 12 px gap less 4), as the Documents preview's
        // Contents button sits 8 px from its header actions.
        <span className="-me-1 flex shrink-0">
          <ContentsButton
            mode="sheet"
            expanded={sheetOpen}
            onOpen={(event) => store.openSheet(chromeKey, event.currentTarget)}
          />
        </span>
      )}
    </span>
  );
}
