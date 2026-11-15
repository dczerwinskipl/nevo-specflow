// The plain-text fragments an excerpt is chosen from (`excerpt.ts`): a section's markdown read as
// paragraphs, list items, table rows and code lines, without Markdown syntax, each split into
// sentences classified as prose or code. A fragment never spans two blocks, so an excerpt never
// glues paragraphs, list items or table rows together.

/** A sentence of a fragment: offsets into `Fragment.text`, `end` excluded. */
export interface Sentence {
  readonly start: number;
  readonly end: number;
  /** Mainly code spans, paths or identifiers, or a line of a fenced code block. */
  readonly code: boolean;
}

/** A paragraph, a list item, a table row or a code line, as plain text on one line. */
export interface Fragment {
  readonly text: string;
  /** In order; together they cover `text` but for the spaces between them. */
  readonly sentences: readonly Sentence[];
}

const FENCE = /^(?:`{3,}|~{3,})/u;
const HEADING = /^#{1,6}(?:\s|$)/u;
const THEMATIC_BREAK = /^(?:[-*_][ \t]*){3,}$/u;
const LINK_DEFINITION = /^\[[^\]]+\]:\s*\S/u;
const QUOTE_MARKERS = /^(?:>\s?)+/u;
const LIST_ITEM = /^(?:[-*+]|\d{1,9}[.)])\s+(?:\[[ xX]\]\s+)?/u;
const TABLE_RULE = /^\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?$/u;
const HTML_COMMENT = /<!--[\s\S]*?-->/gu;
const SENTENCE_BOUNDARY = /(?<=[.!?…])\s+(?=[\p{Lu}\p{N}"'(“‘[])/gu;
/** A path, file name, identifier, call or command-line flag written without a code span. */
const CODE_LIKE_WORD = /[/\\_]|\w\.\w|\p{Ll}\p{Lu}|\(\)|::|^--?\p{L}/u;
const LETTER = /\p{L}/gu;

/** The fragments of `section` (markdown, heading lines included), in document order. */
export function fragments(section: string): Fragment[] {
  const lines = section.replace(/\r\n?/gu, '\n').replace(HTML_COMMENT, ' ').split('\n');
  const out: Fragment[] = [];
  let block: string[] = [];
  let fenced = false;
  let table = false;
  const flush = () => {
    if (block.length > 0) {
      push(out, inline(block.join(' ')));
      block = [];
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]!.trim();
    if (fenced) {
      if (FENCE.test(raw)) {
        fenced = false;
      } else if (raw) {
        const text = raw.replace(/\s+/gu, ' ');
        out.push({ text, sentences: [{ start: 0, end: text.length, code: true }] });
      }

      continue;
    }

    const line = raw.replace(QUOTE_MARKERS, '').trim();
    const tableRow = line.includes('|') && (table || isTableRule(lines[index + 1]));
    if (!tableRow) {
      table = false;
    }

    if (FENCE.test(line)) {
      flush();
      fenced = true;
    } else if (
      !line ||
      HEADING.test(line) ||
      THEMATIC_BREAK.test(line) ||
      LINK_DEFINITION.test(line)
    ) {
      flush();
    } else if (tableRow && !table) {
      // A header row: the rule after it starts a table, and both are dropped.
      flush();
      table = true;
      index += 1;
    } else if (tableRow || line.startsWith('|')) {
      flush();
      push(out, row(line));
    } else if (LIST_ITEM.test(line)) {
      flush();
      block = [line.replace(LIST_ITEM, '')];
    } else {
      block.push(line);
    }
  }

  flush();

  return out;
}

function isTableRule(line: string | undefined): boolean {
  const text = line?.trim().replace(QUOTE_MARKERS, '').trim() ?? '';

  return text.includes('|') && TABLE_RULE.test(text);
}

/** Plain text and where its code spans are. */
interface Inline {
  readonly text: string;
  readonly code: readonly (readonly [number, number])[];
}

/** A table row read as `first cell — cell; cell`, empty cells left out. */
function row(line: string): Inline {
  const cells = line
    .replace(/^\|/u, '')
    .replace(/(?<!\\)\|$/u, '')
    .split(/(?<!\\)\|/u)
    .map((cell) => inline(cell.replace(/\\\|/gu, '|')))
    .filter((cell) => cell.text !== '');
  const text: string[] = [];
  const code: (readonly [number, number])[] = [];
  let length = 0;
  cells.forEach((cell, index) => {
    const separator = index === 0 ? '' : index === 1 ? ' — ' : '; ';
    length += separator.length;
    code.push(...cell.code.map(([start, end]) => [start + length, end + length] as const));
    text.push(separator, cell.text);
    length += cell.text.length;
  });

  return { text: text.join(''), code };
}

/**
 * Markdown inline syntax removed: code spans keep their content, images their alt text and links
 * their text; emphasis, strikethrough, footnote references, HTML tags and backslash escapes are
 * dropped and the common entities decoded. Whitespace is collapsed to single spaces.
 */
function inline(markdown: string): Inline {
  const held: { readonly text: string; readonly code: boolean }[] = [];
  const hold = (text: string, code: boolean) => `${held.push({ text, code }) - 1}`;

  let text = markdown
    .replace(/(`+)(?!`)([\s\S]*?[^`])\1(?!`)/gu, (_match, _ticks, content: string) =>
      hold(content.replace(/\s+/gu, ' ').trim(), true),
    )
    .replace(/\\([!-/:-@[-`{-~])/gu, (_match, char: string) => hold(char, false))
    .replace(/!\[([^\]]*)\](?:\([^)]*\)|\[[^\]]*\])/gu, '$1')
    .replace(/\[\^[^\]]+\]/gu, '')
    .replace(/\[([^\]]+)\](?:\((?:[^()]|\([^)]*\))*\)|\[[^\]]*\])/gu, '$1')
    .replace(/<((?:https?|mailto):[^>\s]+)>/gu, (_match, url: string) => hold(url, false))
    .replace(/<br\s*\/?>/giu, ' ');
  // Tags are removed until none is left, so a nested `<<b>script>` cannot rebuild one. Entities are
  // decoded afterwards on purpose: the excerpt is plain text (rendered as text, never as HTML), and
  // `&lt;` is meant to read as `<`.
  for (let previous = ''; previous !== text;) {
    previous = text;
    text = text.replace(/<\/?[A-Za-z][^<>]*>/gu, '');
  }

  text = text.replace(
    /&(amp|lt|gt|quot|apos|nbsp|#39);/gu,
    (_match, name: string) => ENTITIES[name]!,
  );

  for (let previous = ''; previous !== text;) {
    previous = text;
    text = text
      .replace(/(\*\*|__|~~)(?=\S)([\s\S]*?\S)\1/gu, '$2')
      .replace(/(^|[^\p{L}\p{N}*])\*(?=\S)([^*]*?\S)\*(?![\p{L}\p{N}*])/gu, '$1$2')
      .replace(/(^|[^\p{L}\p{N}_])_(?=\S)([^_]*?\S)_(?![\p{L}\p{N}_])/gu, '$1$2');
  }

  text = text.replace(/`/gu, '').replace(/\s+/gu, ' ').trim();

  const code: [number, number][] = [];
  let shift = 0;
  const plain = text.replace(/(\d+)/gu, (match, index: string, offset: number) => {
    const piece = held[Number(index)]!;
    const start = offset + shift;
    if (piece.code && piece.text !== '') {
      code.push([start, start + piece.text.length]);
    }

    shift += piece.text.length - match.length;

    return piece.text;
  });

  return { text: plain, code };
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  nbsp: ' ',
};

function push(out: Fragment[], { text, code }: Inline): void {
  if (text === '') {
    return;
  }

  const sentences: Sentence[] = [];
  let start = 0;
  for (const boundary of text.matchAll(SENTENCE_BOUNDARY)) {
    if (!code.some(([from, to]) => boundary.index > from && boundary.index < to)) {
      sentences.push(sentence(text, start, boundary.index, code));
      start = boundary.index + boundary[0].length;
    }
  }

  sentences.push(sentence(text, start, text.length, code));
  out.push({ text, sentences });
}

/**
 * A sentence is code when it has code (a code span, or a path or identifier outside one) and either
 * fewer than three prose words or more than twice as many code letters as prose letters. A single
 * code span inside a real sentence keeps it prose.
 */
function sentence(
  text: string,
  start: number,
  end: number,
  code: readonly (readonly [number, number])[],
): Sentence {
  let codeLetters = 0;
  let proseLetters = 0;
  let proseWords = 0;
  for (const word of text.slice(start, end).matchAll(/\S+/gu)) {
    const from = start + word.index;
    const to = from + word[0].length;
    const letters = word[0].match(LETTER)?.length ?? 0;
    const inCode = code.filter(([codeFrom, codeTo]) => codeFrom < to && codeTo > from);
    if (inCode.length > 0) {
      // Letters of the word outside its code spans (`(`x`)`) are punctuation in practice.
      codeLetters += letters;
    } else if (CODE_LIKE_WORD.test(word[0])) {
      codeLetters += letters;
    } else if (letters > 0) {
      proseLetters += letters;
      proseWords += 1;
    }
  }

  return {
    start,
    end,
    code: codeLetters > 0 && (proseWords < 3 || codeLetters > 2 * proseLetters),
  };
}
