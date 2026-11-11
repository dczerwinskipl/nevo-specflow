import { createHash } from 'node:crypto';

import type { Chunk, SourceUnit } from './chunk';

/**
 * Version of the chunking behavior. Any change to how chunks, their ids, texts or embedding texts
 * are produced MUST increment it, so stored vectors are rebuilt (ADR 0021).
 */
export const CHUNKER_VERSION = 4;

/** Size bound of one chunk's section text, in characters. */
export const CHUNK_MAX_CHARS = 2000;

/** Characters repeated at the start of the next window when one Markdown block exceeds the bound. */
export const CHUNK_OVERLAP_CHARS = 200;

/** Section id of the text before the first heading; `_` never occurs in a heading slug. */
export const PREAMBLE_SECTION_ID = '_top';

const HEADING_PATH_SEPARATOR = ' > ';
const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/u;
const FENCE = /^ {0,3}(`{3,}|~{3,})/u;
const LIST_ITEM = /^( *)(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/u;

/** One heading section of a unit's markdown: its heading line and its lines up to the next heading. */
export interface MarkdownSection {
  /**
   * Stable and unique within the unit: the id of the parent section (the nearest enclosing heading
   * of a higher level), `/` and the heading's slug (`headingSlug`: its words joined by `-`,
   * `section` when it has none); just the slug for a top-level heading, and `PREAMBLE_SECTION_ID`
   * for the text before the first heading. A slug that a sibling earlier in the same parent already
   * has gets the first free `~<n>` (n >= 2). So a section's id starts with its parent's id and `/`
   * exactly when it is inside that parent, also under repeated headings; it changes only when a
   * heading on its path changes or an earlier sibling takes the same slug.
   */
  readonly id: string;
  /** The parent section's id; absent for a top-level heading and the preamble. */
  readonly parentId?: string;
  readonly headingPath: readonly string[];
  /** 1-based line of the heading in the unit text (of the first line, for the preamble). */
  readonly startLine: number;
  /** The heading line and the section's own lines, without its subsections. */
  readonly lines: readonly string[];
}

interface RawSection {
  readonly headingPath: readonly string[];
  readonly startLine: number;
  readonly lines: string[];
  /** Index of the parent's raw section; absent at the top level. */
  readonly parent?: number;
}

/**
 * Splits a unit's markdown into its sections (`splitMarkdownSections`). Each chunk keeps its heading
 * path and section id; sections without content besides their heading produce no chunk. A section
 * longer than `CHUNK_MAX_CHARS` is split on Markdown block boundaries (`splitBlocks`: paragraphs,
 * list items, tables and fenced code blocks, which are never cut) into parts packed up to the bound;
 * only a single block longer than the bound is cut into character windows that overlap by
 * `CHUNK_OVERLAP_CHARS`. Parts do not overlap otherwise.
 *
 * Chunk ids are `<unit id>#<section id>`, with `:<part>` for the parts of an oversize section, so
 * editing one section does not change the ids of the others; section ids are unique within a unit,
 * so chunk ids are too.
 */
export function chunkMarkdownUnit(unit: SourceUnit): Chunk[] {
  const chunks: Chunk[] = [];

  for (const section of splitMarkdownSections(unit.text)) {
    if (!hasContentBesidesHeading(section)) {
      continue;
    }

    const pathKey = section.headingPath.join(HEADING_PATH_SEPARATOR);
    const leading = section.lines.findIndex(isContent);
    const parts = splitSection(trimBlankLines(section.lines));
    const baseId = `${unit.id}#${section.id}`;
    parts.forEach((part, index) => {
      const embeddingText = [unit.header, pathKey, part.text]
        .filter((value) => value.trim().length > 0)
        .join('\n\n');
      chunks.push({
        id: parts.length === 1 ? baseId : `${baseId}:${index + 1}`,
        unitId: unit.id,
        headingPath: section.headingPath,
        sectionId: section.id,
        startLine: section.startLine + leading + part.line,
        text: part.text,
        embeddingText,
        contentHash: hashChunk(embeddingText),
        metadata: unit.metadata,
      });
    });
  }

  return chunks;
}

/**
 * Splits markdown on ATX headings (`#` .. `######`), ignoring headings inside fenced code blocks.
 * Every heading starts a section, also one without content of its own; the text before the first
 * heading is a section with the empty heading path unless it is blank.
 */
export function splitMarkdownSections(markdown: string): MarkdownSection[] {
  const used = new Set<string>();
  const ids: string[] = [];
  const sections: MarkdownSection[] = [];
  splitRawSections(markdown).forEach((section, index) => {
    const { parent, ...rest } = section;
    if (section.headingPath.length === 0) {
      ids[index] = PREAMBLE_SECTION_ID;
      if (section.lines.some(isContent)) {
        sections.push({ id: PREAMBLE_SECTION_ID, ...rest });
      }

      return;
    }

    const parentId = parent === undefined ? undefined : ids[parent]!;
    const slug = headingSlug(section.headingPath.at(-1)!);
    const base = parentId === undefined ? slug : `${parentId}/${slug}`;
    let id = base;
    for (let occurrence = 2; used.has(id); occurrence += 1) {
      id = `${base}~${occurrence}`;
    }

    used.add(id);
    ids[index] = id;
    sections.push({ id, ...(parentId === undefined ? {} : { parentId }), ...rest });
  });

  return sections;
}

/**
 * Lower-case letters without a Unicode decomposition and their ASCII spelling, for heading slugs.
 * Kept here, apart from the ranking tokenizer, so section and chunk ids change only with the
 * chunker (and its `CHUNKER_VERSION`), never with a ranking change.
 */
const SLUG_LETTER_FOLDS: Readonly<Record<string, string>> = {
  ł: 'l',
  ø: 'o',
  ß: 'ss',
  đ: 'd',
  æ: 'ae',
  œ: 'oe',
  þ: 'th',
};
const SLUG_FOLDED_LETTERS = new RegExp(`[${Object.keys(SLUG_LETTER_FOLDS).join('')}]`, 'gu');

/**
 * A heading's slug: NFKD, combining marks removed, lower-cased, letters without a decomposition
 * folded, then the Unicode letter/digit runs joined by `-`; `section` for a heading without any.
 */
function headingSlug(heading: string): string {
  const words =
    heading
      .normalize('NFKD')
      .replace(/\p{M}+/gu, '')
      .toLowerCase()
      .replace(SLUG_FOLDED_LETTERS, (letter) => SLUG_LETTER_FOLDS[letter]!)
      .match(/[\p{L}\p{N}]+/gu) ?? [];

  return words.join('-') || 'section';
}

function splitRawSections(markdown: string): RawSection[] {
  const sections: RawSection[] = [];
  const path: string[] = [];
  const levels: number[] = [];
  // Raw section index of each heading on `path`.
  const owners: number[] = [];
  let current: RawSection = { headingPath: [], startLine: 1, lines: [] };
  const fence = createFenceTracker();

  for (const [index, line] of markdown.replace(/\r\n?/gu, '\n').split('\n').entries()) {
    const fenced = fence.track(line);
    const heading = fenced === 'outside' ? ATX_HEADING.exec(line) : null;
    if (!heading) {
      current.lines.push(line);
      continue;
    }

    const level = heading[1]!.length;
    while (levels.length > 0 && levels[levels.length - 1]! >= level) {
      levels.pop();
      path.pop();
      owners.pop();
    }

    const parent = owners.at(-1);
    levels.push(level);
    path.push((heading[2] ?? '').trim());

    sections.push(current);
    owners.push(sections.length);
    current = {
      headingPath: [...path],
      startLine: index + 1,
      lines: [line],
      ...(parent === undefined ? {} : { parent }),
    };
  }

  sections.push(current);

  return sections;
}

/**
 * Where a line is relative to fenced code blocks: `outside`, a `fence` line (opening or closing)
 * or `inside` a block. A block closes at a fence of the same character at least as long; another
 * fence-like line inside it is `inside`.
 */
function createFenceTracker(): { track(line: string): 'outside' | 'fence' | 'inside' } {
  let open: string | undefined;

  return {
    track(line) {
      const match = FENCE.exec(line);
      if (match) {
        const marker = match[1]!;
        if (open === undefined) {
          open = marker;

          return 'fence';
        }

        if (marker.startsWith(open[0]!) && marker.length >= open.length) {
          open = undefined;

          return 'fence';
        }

        return 'inside';
      }

      return open === undefined ? 'outside' : 'inside';
    },
  };
}

function isContent(line: string): boolean {
  return line.trim().length > 0;
}

function hasContentBesidesHeading(section: MarkdownSection): boolean {
  const body = section.headingPath.length === 0 ? section.lines : section.lines.slice(1);

  return body.some(isContent);
}

function trimBlankLines(lines: readonly string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && !isContent(lines[start]!)) {
    start += 1;
  }

  while (end > start && !isContent(lines[end - 1]!)) {
    end -= 1;
  }

  return lines.slice(start, end);
}

/** One part of a section: its text and the 0-based index of its first line in the section lines. */
interface Part {
  readonly text: string;
  readonly line: number;
}

/**
 * A section's parts: the whole section when it fits `CHUNK_MAX_CHARS`, otherwise its blocks packed
 * in order into parts of at most the bound (blocks joined as in the source, by a blank line or, for
 * list items, a line break). A block longer than the bound alone becomes character windows; the
 * section's heading line, when nothing else precedes that block, is the start of its first window
 * rather than a part of its own.
 */
function splitSection(lines: readonly string[]): Part[] {
  const text = lines.join('\n');
  if (text.length <= CHUNK_MAX_CHARS) {
    return [{ text, line: 0 }];
  }

  const parts: Part[] = [];
  let current: Part | undefined;
  let headingOnly = false;
  for (const block of splitBlocks(lines)) {
    const joined =
      current === undefined ? block.text : `${current.text}${block.separator}${block.text}`;
    if (joined.length <= CHUNK_MAX_CHARS) {
      headingOnly = current === undefined && ATX_HEADING.test(block.text);
      current = { text: joined, line: current?.line ?? block.line };
      continue;
    }

    if (block.text.length > CHUNK_MAX_CHARS) {
      const prefix = headingOnly && current !== undefined ? joined.length - block.text.length : 0;
      if (current !== undefined && prefix === 0) {
        parts.push(current);
      }

      for (const window of windows(prefix > 0 ? joined : block.text)) {
        const inBlock = window.offset - prefix;
        parts.push({
          text: window.text,
          line: inBlock < 0 ? current!.line : block.line + lineBreaks(block.text, inBlock),
        });
      }

      current = undefined;
    } else {
      parts.push(current!);
      current = { text: block.text, line: block.line };
    }

    headingOnly = false;
  }

  if (current !== undefined) {
    parts.push(current);
  }

  return parts;
}

function lineBreaks(text: string, before: number): number {
  let count = 0;
  for (
    let index = text.indexOf('\n');
    index !== -1 && index < before;
    index = text.indexOf('\n', index + 1)
  ) {
    count += 1;
  }

  return count;
}

interface Block {
  readonly text: string;
  /** What joins the block to the one before it in the source. */
  readonly separator: string;
  /** 0-based index of the block's first line in the section lines. */
  readonly line: number;
}

/**
 * The Markdown blocks of a section's lines, each never split: a heading line, a paragraph or table
 * (lines up to a blank line), a fenced code block (opening to closing fence, blank lines included)
 * and each item of a list (its marker line and the lines that continue it, also an indented
 * paragraph after a blank line).
 */
function splitBlocks(lines: readonly string[]): Block[] {
  const blocks: Block[] = [];
  const fence = createFenceTracker();
  let current: string[] = [];
  let separator = '';
  let first = 0;
  let sawBlank = false;
  const flush = () => {
    if (current.length > 0) {
      blocks.push({ text: current.join('\n'), separator, line: first });
      current = [];
    }
  };

  const start = (line: string, index: number) => {
    flush();
    separator = sawBlank ? '\n\n' : '\n';
    sawBlank = false;
    first = index;
    current = [line];
  };

  for (const [index, line] of lines.entries()) {
    const position = fence.track(line);
    if (position === 'inside' || (position === 'fence' && current.length > 0 && isFence(current))) {
      current.push(line);
      if (position === 'fence') {
        flush();
      }
    } else if (position === 'fence') {
      start(line, index);
    } else if (!isContent(line)) {
      flush();
      sawBlank = true;
    } else if (ATX_HEADING.test(line)) {
      start(line, index);
      flush();
    } else if (LIST_ITEM.test(line)) {
      start(line, index);
    } else if (current.length > 0) {
      current.push(line);
    } else if (sawBlank && /^\s/u.test(line) && isListItem(blocks.at(-1))) {
      // An indented paragraph after a blank line continues the list item before it.
      const previous = blocks.pop()!;
      separator = previous.separator;
      first = previous.line;
      current = [previous.text, '', line];
      sawBlank = false;
    } else {
      start(line, index);
    }
  }

  flush();

  return blocks;
}

/** Whether `lines` is an open fenced code block (its first line is a fence). */
function isFence(lines: readonly string[]): boolean {
  return FENCE.test(lines[0]!);
}

function isListItem(block: Block | undefined): boolean {
  return block !== undefined && LIST_ITEM.test(block.text);
}

/**
 * Character windows of at most `CHUNK_MAX_CHARS` over one oversize block, with the offset of each
 * window's first character. A window ends at the last line break (or else the last whitespace) in
 * its second half when there is one, so words are not cut. The next window starts about
 * `CHUNK_OVERLAP_CHARS` before that end: at the first line start in that overlap when it has one
 * (so a table row or code line is repeated whole), otherwise at its first word.
 */
function windows(text: string): { readonly text: string; readonly offset: number }[] {
  const parts: { text: string; offset: number }[] = [];
  let start = 0;
  for (;;) {
    let end = Math.min(start + CHUNK_MAX_CHARS, text.length);
    if (end < text.length) {
      const window = text.slice(start, end);
      const minimum = Math.floor(CHUNK_MAX_CHARS / 2);
      const lineBreak = window.lastIndexOf('\n');
      const whitespace = window.search(/\s\S*$/u);
      const boundary = lineBreak >= minimum ? lineBreak : whitespace >= minimum ? whitespace : -1;
      if (boundary > 0) {
        end = start + boundary;
      }
    }

    const raw = text.slice(start, end);
    const leading = raw.length - raw.trimStart().length;
    parts.push({ text: raw.trim(), offset: start + leading });
    if (end >= text.length) {
      return parts;
    }

    const overlap = end - CHUNK_OVERLAP_CHARS;
    const region = text.slice(overlap, end);
    const lineStart = region.indexOf('\n');
    const wordStart = region.search(/(?<=\s)\S/u);
    start =
      lineStart !== -1 && lineStart + 1 < region.length
        ? overlap + lineStart + 1
        : wordStart === -1
          ? overlap
          : overlap + wordStart;
  }
}

function hashChunk(embeddingText: string): string {
  return createHash('sha256').update(`${CHUNKER_VERSION}\n${embeddingText}`).digest('hex');
}
