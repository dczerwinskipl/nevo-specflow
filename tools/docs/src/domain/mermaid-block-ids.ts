// Repository-only check: Mermaid blocks and nodes share an identifier namespace.
// A collision breaks diagram geometry even when Mermaid accepts the source.

import type { DocRecord } from '@nevo/specflow-docs';

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const BLOCK_RE = /^\s*block:([A-Za-z_][\w-]*)\b/;
const NODE_RE = /^\s*([A-Za-z_][\w-]*)(?=\s*(?:\[|\(|\{|:\d+\s*$))/;

interface Fence {
  readonly character: string;
  readonly width: number;
  readonly language: string;
  readonly content: string[];
}

function checkDiagram(file: string, number: number, lines: readonly string[]): string[] {
  if (lines.find((line) => line.trim())?.trim() !== 'block-beta') {
    return [];
  }

  const issues: string[] = [];
  const seen = new Map<string, { kind: 'block' | 'node'; line: number }>();

  for (const [index, line] of lines.entries()) {
    const block = BLOCK_RE.exec(line);
    const node = block ? null : NODE_RE.exec(line);
    const id = (block ?? node)?.[1];
    if (!id || (!block && id === 'space')) {
      continue;
    }

    const kind = block ? 'block' : 'node';
    const previous = seen.get(id);
    if (previous) {
      issues.push(
        `${file}: Mermaid block-beta #${number}: identifier '${id}' is reused ` +
          `(${previous.kind} at diagram line ${previous.line}; ${kind} at line ${index + 1})`,
      );
    } else {
      seen.set(id, { kind, line: index + 1 });
    }
  }

  return issues;
}

/** Check identifier uniqueness in every fenced Mermaid block diagram in the docs corpus. */
export function validateMermaidBlockIds(docs: readonly DocRecord[]): string[] {
  const issues: string[] = [];

  for (const doc of docs) {
    let fence: Fence | undefined;
    let diagram = 0;

    for (const line of doc.body.split(/\r?\n/)) {
      const marker = FENCE_RE.exec(line);
      if (!fence) {
        if (marker) {
          const prefix = marker[1]!;
          fence = {
            character: prefix[0]!,
            width: prefix.length,
            language: (marker[2] ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '',
            content: [],
          };
        }

        continue;
      }

      const closing = marker?.[1];
      if (
        closing?.startsWith(fence.character) &&
        closing.length >= fence.width &&
        (marker?.[2] ?? '').trim() === ''
      ) {
        if (fence.language === 'mermaid') {
          diagram += 1;
          issues.push(...checkDiagram(doc.file, diagram, fence.content));
        }

        fence = undefined;
      } else if (fence.language === 'mermaid') {
        fence.content.push(line);
      }
    }
  }

  return issues;
}
