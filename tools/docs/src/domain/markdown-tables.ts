// Repo-only Markdown table integrity check for roadmap documents.
//
// Prettier aligns cells but does not reject a header with a different number of cells
// than the body. Keep this check small and scoped to product planning docs, not a
// second Markdown parser for every document in the repository.

import type { DocRecord } from '@nevo/specflow-docs';

const ROADMAP_DOCS = new Set(['ideas.roadmap', 'ideas.roadmap-coverage']);

function cells(line: string): string[] {
  const value = line.trim().slice(1, -1);
  const result: string[] = [];
  let cell = '';
  let inlineTicks = 0;

  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    // An escaped pipe is text, not a cell boundary.
    if (ch === '\\' && i + 1 < value.length) {
      cell += ch + value[++i];
      continue;
    }
    if (ch === '`') {
      let count = 1;
      while (value[i + count] === '`') count++;
      if (inlineTicks === 0) inlineTicks = count;
      else if (count === inlineTicks) inlineTicks = 0;
      cell += '`'.repeat(count);
      i += count - 1;
      continue;
    }
    if (ch === '|' && inlineTicks === 0) {
      result.push(cell.trim());
      cell = '';
      continue;
    }
    cell += ch;
  }

  result.push(cell.trim());
  return result;
}

function isTableLine(line: string): boolean {
  const s = line.trim();
  return s.startsWith('|') && s.endsWith('|');
}

const isRule = (text: string): boolean => /^:?-{3,}:?$/.test(text);

/**
 * Validate GitHub-flavoured pipe-table widths in the two roadmap documents.
 * Ignore fenced code examples and pipes escaped or enclosed by inline code.
 */
export function validateRoadmapTables(docs: readonly DocRecord[]): string[] {
  const issues: string[] = [];

  for (const doc of docs) {
    if (!ROADMAP_DOCS.has(String(doc.id))) continue;
    const lines = doc.body.split(/\r?\n/);
    let fence: { char: string; min: number } | undefined;

    for (let i = 0; i < lines.length; ) {
      const line = (lines[i] ?? '').trim();
      const code = /^(\x60{3,}|~{3,})/.exec(line);
      if (code?.[1]) {
        const marker = code[1];
        if (!fence) fence = { char: marker.charAt(0), min: marker.length };
        else if (marker.charAt(0) === fence.char && marker.length >= fence.min)
          fence = undefined;
        i++;
        continue;
      }
      if (fence || !isTableLine(lines[i] ?? '')) {
        i++;
        continue;
      }

      const start = i;
      while (i < lines.length && isTableLine(lines[i] ?? '')) i++;
      const rows = lines.slice(start, i).map(cells);
      if (rows.length < 2 || !rows[1]?.every(isRule)) continue;

      const width = rows[0]?.length ?? 0;
      for (let j = 1; j < rows.length; j++) {
        const actual = rows[j]?.length ?? 0;
        if (actual !== width) {
          issues.push(
            `${doc.file}:${start + j + 1}: Markdown table has ${actual} cells, header has ${width}`,
          );
        }
      }
    }
  }

  return issues;
}
