import { createHash } from 'node:crypto';

import { tokenize } from '../ranking/tokenize';
import type { Chunk, SourceUnit } from './chunk';

/**
 * Version of the chunking behavior. Any change to how chunks, their ids, texts or embedding texts
 * are produced MUST increment it, so stored vectors are rebuilt (ADR 0021).
 */
export const CHUNKER_VERSION = 2;

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
   * Stable and unique within the unit: the heading path as slugs (the `tokenize` words of a heading
   * joined by `-`, `section` when it has none) joined by `/`, and `PREAMBLE_SECTION_ID` for the text
   * before the first heading. A path that occurred earlier in the unit gets the first free `~<n>`
   * (n >= 2). It changes only when a heading of its path changes or an earlier section takes the
   * same path, not when other sections are edited.
   */
  readonly id: string;
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
    const parts = splitSection(trimBlankLines(section.lines));
    const baseId = `${unit.id}#${section.id}`;
    parts.forEach((part, index) => {
      const embeddingText = [unit.header, pathKey, part]
        .filter((value) => value.trim().length > 0)
        .join('\n\n');
      chunks.push({
        id: parts.length === 1 ? baseId : `${baseId}:${index + 1}`,
        unitId: unit.id,
        headingPath: section.headingPath,
        sectionId: section.id,
        startLine: section.startLine,
        text: part,
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

  return splitRawSections(markdown)
    .filter((section) => section.headingPath.length > 0 || section.lines.some(isContent))
    .map((section) => {
      const base =
        section.headingPath.length === 0
          ? PREAMBLE_SECTION_ID
          : section.headingPath
              .map((heading) => tokenize(heading).join('-') || 'section')
              .join('/');
      let id = base;
      for (let occurrence = 2; used.has(id); occurrence += 1) {
        id = `${base}~${occurrence}`;
      }

      used.add(id);

      return { id, ...section };
    });
}

function splitRawSections(markdown: string): RawSection[] {
  const sections: RawSection[] = [];
  const path: string[] = [];
  const levels: number[] = [];
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
    }

    levels.push(level);
    path.push((heading[2] ?? '').trim());

    sections.push(current);
    current = { headingPath: [...path], startLine: index + 1, lines: [line] };
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

/**
 * A section's parts: the whole section when it fits `CHUNK_MAX_CHARS`, otherwise its blocks packed
 * in order into parts of at most the bound (blocks joined as in the source, by a blank line or, for
 * list items, a line break). A block longer than the bound alone becomes character windows; the
 * section's heading line, when nothing else precedes that block, is the start of its first window
 * rather than a part of its own.
 */
function splitSection(lines: readonly string[]): string[] {
  const text = lines.join('\n');
  if (text.length <= CHUNK_MAX_CHARS) {
    return [text];
  }

  const parts: string[] = [];
  let current = '';
  let headingOnly = false;
  for (const block of splitBlocks(lines)) {
    const joined = current === '' ? block.text : `${current}${block.separator}${block.text}`;
    if (joined.length <= CHUNK_MAX_CHARS) {
      headingOnly = current === '' && ATX_HEADING.test(block.text);
      current = joined;
      continue;
    }

    if (block.text.length > CHUNK_MAX_CHARS) {
      if (current !== '' && !headingOnly) {
        parts.push(current);
      }

      parts.push(...windows(headingOnly ? joined : block.text));
      current = '';
    } else {
      parts.push(current);
      current = block.text;
    }

    headingOnly = false;
  }

  if (current !== '') {
    parts.push(current);
  }

  return parts;
}

interface Block {
  readonly text: string;
  /** What joins the block to the one before it in the source. */
  readonly separator: string;
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
  let sawBlank = false;
  const flush = () => {
    if (current.length > 0) {
      blocks.push({ text: current.join('\n'), separator });
      current = [];
    }
  };

  const start = (line: string) => {
    flush();
    separator = sawBlank ? '\n\n' : '\n';
    sawBlank = false;
    current = [line];
  };

  for (const line of lines) {
    const position = fence.track(line);
    if (position === 'inside' || (position === 'fence' && current.length > 0 && isFence(current))) {
      current.push(line);
      if (position === 'fence') {
        flush();
      }
    } else if (position === 'fence') {
      start(line);
    } else if (!isContent(line)) {
      flush();
      sawBlank = true;
    } else if (ATX_HEADING.test(line)) {
      start(line);
      flush();
    } else if (LIST_ITEM.test(line)) {
      start(line);
    } else if (current.length > 0) {
      current.push(line);
    } else if (sawBlank && /^\s/u.test(line) && isListItem(blocks.at(-1))) {
      // An indented paragraph after a blank line continues the list item before it.
      const previous = blocks.pop()!;
      separator = previous.separator;
      current = [previous.text, '', line];
      sawBlank = false;
    } else {
      start(line);
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
 * Character windows of at most `CHUNK_MAX_CHARS` over one oversize block. A window ends at the last
 * line break (or else the last whitespace) in its second half when there is one, so words are not
 * cut; the next window starts about `CHUNK_OVERLAP_CHARS` before that end, at a word boundary.
 */
function windows(text: string): string[] {
  const parts: string[] = [];
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

    parts.push(text.slice(start, end).trim());
    if (end >= text.length) {
      return parts;
    }

    const overlap = end - CHUNK_OVERLAP_CHARS;
    const wordStart = text.slice(overlap, end).search(/(?<=\s)\S/u);
    start = wordStart === -1 ? overlap : overlap + wordStart;
  }
}

function hashChunk(embeddingText: string): string {
  return createHash('sha256').update(`${CHUNKER_VERSION}\n${embeddingText}`).digest('hex');
}
