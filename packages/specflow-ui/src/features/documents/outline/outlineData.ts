import { parseFrontmatter, type FrontmatterProperty } from '../frontmatter/frontmatter';
import { markdownOutline, type OutlineHeading } from './markdownOutline';

/** What the preview derives from the text of a markdown document, parsed once per change. */
export interface DocumentOutlineData {
  /** The headings worth listing: none unless there are at least two. */
  readonly headings: readonly OutlineHeading[];
  /** The leading YAML block as key/value pairs, when there is one. */
  readonly properties?: readonly FrontmatterProperty[];
  /** The text to render: the document without its frontmatter block (line numbers kept). */
  readonly body: string;
}

export function documentOutline(content: string, markdown: boolean): DocumentOutlineData {
  if (!markdown) {
    return { headings: [], body: content };
  }

  const frontmatter = parseFrontmatter(content);
  const body = frontmatter ? frontmatter.body : content;
  const found = markdownOutline(body);

  return {
    // One heading is not a list worth showing.
    headings: found.length >= 2 ? found : [],
    properties: frontmatter?.properties,
    body,
  };
}

/** What the mounted preview offers to whoever shows the contents (the sheet, the header). */
export interface OutlineNavigator {
  /**
   * Scrolls the preview to a heading and moves focus onto it. `pointer` says the choice was made
   * with a mouse or a finger: the heading then takes focus without a ring.
   */
  goTo: (line: number, pointer?: boolean) => void;
  /** The heading the reader is at now (measured on call), if any. */
  activeLine: () => number | undefined;
}
