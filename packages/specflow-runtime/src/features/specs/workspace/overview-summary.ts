/** Bytes of the overview read for the workspace description (a bounded prefix, never the file). */
export const OVERVIEW_SUMMARY_PREFIX_BYTES = 32 * 1024;
/**
 * The longest description returned, in graphemes including the trailing ellipsis; longer text is cut
 * at a word boundary where possible.
 */
export const OVERVIEW_SUMMARY_MAX_GRAPHEMES = 320;

const FENCE = /^ {0,3}(`{3,}|~{3,})/u;
const HEADING = /^ {0,3}#{1,6}(?:\s|$)/u;
const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)\s*$/u;
const THEMATIC_BREAK = /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/u;
const TABLE_DELIMITER = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/u;
const INDENTED_CODE = /^(?: {4}|\t)/u;
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/**
 * The workspace description: the first non-empty paragraph of the overview Markdown as plain text.
 *
 * Front matter, headings (so also the first H1), HTML tags and comments, images, fenced and indented
 * code and tables are dropped; links keep their text; emphasis, inline-code, list and quote markers
 * are removed; whitespace is collapsed. Text longer than {@link OVERVIEW_SUMMARY_MAX_GRAPHEMES}
 * graphemes is cut at a word boundary where possible and ends with `…`, the whole within the bound.
 * A document with no prose is `''`.
 */
export function summarizeOverview(markdown: string): string {
  const lines = withoutHtmlComments(withoutFrontMatter(markdown.replace(/\r\n?/gu, '\n'))).split(
    '\n',
  );
  let paragraph: string[] = [];
  let fence: string | undefined;
  let inTable = false;

  const flush = (): string => {
    const text = collapse(paragraph.map(inlineText).join(' '));
    paragraph = [];

    return text;
  };

  for (const line of lines) {
    if (fence) {
      if (line.trim().startsWith(fence)) {
        fence = undefined;
      }

      continue;
    }

    const opening = FENCE.exec(line);
    if (opening) {
      const text = flush();
      if (text) {
        return truncate(text);
      }

      fence = opening[1]!;
      continue;
    }

    if (line.trim() === '') {
      inTable = false;
      const text = flush();
      if (text) {
        return truncate(text);
      }

      continue;
    }

    if (inTable) {
      continue;
    }

    if (TABLE_DELIMITER.test(line)) {
      // The paragraph so far was the table's header row.
      paragraph = [];
      inTable = true;
      continue;
    }

    if (line.trimStart().startsWith('|')) {
      continue;
    }

    if (paragraph.length > 0 && SETEXT_UNDERLINE.test(line)) {
      // The paragraph so far was a setext heading.
      paragraph = [];
      continue;
    }

    if (HEADING.test(line) || THEMATIC_BREAK.test(line)) {
      const text = flush();
      if (text) {
        return truncate(text);
      }

      continue;
    }

    if (paragraph.length === 0 && INDENTED_CODE.test(line)) {
      continue;
    }

    paragraph.push(line);
  }

  return fence ? '' : truncate(flush());
}

function withoutFrontMatter(text: string): string {
  if (!/^---[ \t]*\n/u.test(text)) {
    return text;
  }

  const end = /\n(?:---|\.\.\.)[ \t]*(?:\n|$)/u.exec(text.slice(3));

  // An unterminated front matter block holds no prose.
  return end ? text.slice(3 + end.index + end[0].length) : '';
}

function withoutHtmlComments(text: string): string {
  const stripped = text.replace(/<!--[\s\S]*?-->/gu, '');
  const open = stripped.indexOf('<!--');

  return open === -1 ? stripped : stripped.slice(0, open);
}

function inlineText(line: string): string {
  return (
    line
      // Quote, list and task markers at the start of a line.
      .replace(/^\s*(?:>\s?)+/u, '')
      .replace(/^\s*(?:[-*+]|\d{1,9}[.)])\s+(?:\[[ xX]\]\s+)?/u, '')
      // Images (inline and reference) disappear; links keep their text.
      .replace(/!\[[^\]]*\](?:\([^)]*\)|\[[^\]]*\])?/gu, '')
      .replace(/\[([^\]]+)\](?:\([^)]*\)|\[[^\]]*\])/gu, '$1')
      .replace(/<(https?:\/\/[^>\s]+)>/gu, '$1')
      .replace(/<\/?[A-Za-z][^>]*>/gu, '')
      .replace(/(`+)([^`]*?)\1/gu, '$2')
      .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/gu, '$2')
      .replace(/(^|[^\w*])\*(?=\S)([^*]*?\S)\*(?![\w*])/gu, '$1$2')
      .replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?!\w)/gu, '$1$2')
      .replace(/~~(?=\S)([\s\S]*?\S)~~/gu, '$1')
      .replace(/\\([\\`*_{}[\]()#+\-.!|>~<])/gu, '$1')
      .replace(/&(amp|lt|gt|quot|apos|nbsp);/gu, (_, name: string) => ENTITIES[name]!)
  );
}

function collapse(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

function truncate(text: string): string {
  const graphemes = Array.from(GRAPHEMES.segment(text), (part) => part.segment);
  if (graphemes.length <= OVERVIEW_SUMMARY_MAX_GRAPHEMES) {
    return text;
  }

  const head = graphemes.slice(0, OVERVIEW_SUMMARY_MAX_GRAPHEMES - 1).join('');
  const boundary = head.lastIndexOf(' ');

  return (boundary > 0 ? head.slice(0, boundary) : head).trimEnd() + '…';
}
