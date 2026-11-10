import { createHash } from 'node:crypto';

import { tokenize } from '../ranking/tokenize';
import type { Chunk, SourceUnit } from './chunk';

/**
 * Version of the chunking behavior. Any change to how chunks, their ids, texts or embedding texts
 * are produced MUST increment it, so stored vectors are rebuilt (ADR 0021).
 */
export const CHUNKER_VERSION = 1;

/** Size bound of one chunk's section text, in characters. */
export const CHUNK_MAX_CHARS = 2000;

/** Characters repeated at the start of the next part when one section exceeds the bound. */
export const CHUNK_OVERLAP_CHARS = 200;

/** Section id of the text before the first heading; `_` never occurs in a heading slug. */
export const PREAMBLE_SECTION_ID = '_top';

const HEADING_PATH_SEPARATOR = ' > ';
const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/u;
const FENCE = /^ {0,3}(`{3,}|~{3,})/u;

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
 * longer than `CHUNK_MAX_CHARS` is split into parts that overlap by `CHUNK_OVERLAP_CHARS`.
 *
 * Chunk ids are `<unit id>#<heading path>`, with `/<part>` for parts of an oversize section, so
 * editing one section does not change the ids of the others. When that id (or one of its part ids)
 * is already taken, by a repeated heading path or a heading that spells a suffix literally, the
 * section id gets the first free `~<n>` (n >= 2): ids are unique within a unit by construction.
 */
export function chunkMarkdownUnit(unit: SourceUnit): Chunk[] {
  const chunks: Chunk[] = [];
  const used = new Set<string>();

  for (const section of splitMarkdownSections(unit.text)) {
    const text = trimBlankLines(section.lines).join('\n');
    if (!hasContentBesidesHeading(section)) {
      continue;
    }

    const pathKey = section.headingPath.join(HEADING_PATH_SEPARATOR);
    const parts = splitOversize(text);
    const idsFor = (sectionId: string) =>
      parts.length === 1 ? [sectionId] : parts.map((_, index) => `${sectionId}/${index + 1}`);
    const baseId = `${unit.id}#${pathKey}`;
    let ids = idsFor(baseId);
    for (let occurrence = 2; ids.some((id) => used.has(id)); occurrence += 1) {
      ids = idsFor(`${baseId}~${occurrence}`);
    }

    for (const id of ids) {
      used.add(id);
    }

    parts.forEach((part, index) => {
      const embeddingText = [unit.header, pathKey, part]
        .filter((value) => value.trim().length > 0)
        .join('\n\n');
      chunks.push({
        id: ids[index]!,
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
  let fence: string | undefined;

  for (const [index, line] of markdown.replace(/\r\n?/gu, '\n').split('\n').entries()) {
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1]!;
      if (fence === undefined) {
        fence = marker;
      } else if (marker.startsWith(fence[0]!) && marker.length >= fence.length) {
        fence = undefined;
      }
    }

    const heading = fence === undefined && !fenceMatch ? ATX_HEADING.exec(line) : null;
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
 * Character windows of at most `CHUNK_MAX_CHARS`. A window ends at the last line break (or else the
 * last whitespace) in its second half when there is one, so words are not cut; the next window
 * starts `CHUNK_OVERLAP_CHARS` before that end.
 */
function splitOversize(text: string): string[] {
  if (text.length <= CHUNK_MAX_CHARS) {
    return [text];
  }

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

    start = end - CHUNK_OVERLAP_CHARS;
  }
}

function hashChunk(embeddingText: string): string {
  return createHash('sha256').update(`${CHUNKER_VERSION}\n${embeddingText}`).digest('hex');
}
