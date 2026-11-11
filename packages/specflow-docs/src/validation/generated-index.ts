// Build and compare the generated documentation index. Pure; the repository does the file I/O.

import type { BuiltIndex, OnDiskIndex } from '../corpus/repository';
import { asString, type DocRecord } from '../frontmatter/contract';

const TYPE_ORDER = [
  'hub',
  'architecture',
  'adr',
  'engineering',
  'product',
  'reference',
  'instruction',
];

function typeRank(type: string): number {
  const i = TYPE_ORDER.indexOf(type);

  return i === -1 ? TYPE_ORDER.length : i;
}

function encodeMarkdownTableCell(value: string): string {
  const result: string[] = [];

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]!;

    if (char === '\r') {
      result.push(' ');
      if (value[i + 1] === '\n') {
        i += 1;
      }
    } else if (char === '\n') {
      result.push(' ');
    } else if (char === '|') {
      result.push('&#124;');
    } else {
      result.push(char);
    }
  }

  return result.join('').trim();
}

export interface IndexOptions {
  /** `docs.root`; links in the markdown index are relative to it. */
  readonly root: string;
}

export interface IndexDiffOptions extends IndexOptions {
  /** The command line that regenerates the index as the host invokes it; used only in hints. */
  readonly checkWriteCommand: string;
}

/**
 * The regenerate command named inside the generated index. It is the product command whatever host
 * wrote the file, so every host produces and accepts the same bytes for the same corpus.
 */
export const INDEX_REGENERATE_COMMAND = 'nevo-specflow docs check --write';

/** Deterministic index content: no timestamp, so writing it twice is a no-op. */
export function buildIndex(docs: readonly DocRecord[], options: IndexOptions): BuiltIndex {
  const rootPrefix = `${options.root}/`;
  const relLink = (file: string): string =>
    file.startsWith(rootPrefix) ? file.slice(rootPrefix.length) : file;

  const sorted = [...docs].sort(
    (a, b) =>
      typeRank(asString(a.type)) - typeRank(asString(b.type)) ||
      asString(a.id).localeCompare(asString(b.id)),
  );

  const byType = new Map<string, DocRecord[]>();
  for (const doc of sorted) {
    const key = asString(doc.type);
    const group = byType.get(key) ?? [];
    group.push(doc);
    byType.set(key, group);
  }

  let md = `<!-- GENERATED FILE — do not edit. Run: ${INDEX_REGENERATE_COMMAND} -->\n\n`;
  md += '# Documentation index\n\n';
  md += `Regenerate with \`${INDEX_REGENERATE_COMMAND}\`.`;
  md += docs.some((doc) => doc.file === `${rootPrefix}README.md`)
    ? ` Human-authored navigation lives in [\`${rootPrefix}README.md\`](README.md).\n\n`
    : '\n\n';

  for (const [type, group] of byType) {
    md += `## ${type.charAt(0).toUpperCase()}${type.slice(1)}\n\n`;
    md += '| ID | Title | Status | Summary |\n|---|---|---|---|\n';
    for (const doc of group) {
      const summary = encodeMarkdownTableCell(asString(doc.summary));
      md +=
        `| \`${asString(doc.id)}\` | [${asString(doc.title)}](${relLink(doc.file)}) | ` +
        `${asString(doc.status)} | ${summary} |\n`;
    }

    md += '\n';
  }

  const json = `${JSON.stringify(
    {
      docs: sorted.map((d) => ({
        id: d.id,
        type: d.type,
        title: d.title,
        status: d.status,
        file: d.file,
        read_when: Array.isArray(d.read_when) ? d.read_when : [],
        summary: typeof d.summary === 'string' ? d.summary : '',
        related: Array.isArray(d.related) ? d.related : [],
        ...(typeof d.scope === 'string' ? { scope: d.scope } : {}),
        ...(Array.isArray(d.areas) && d.areas.length ? { areas: d.areas } : {}),
        ...(Array.isArray(d.tags) && d.tags.length ? { tags: d.tags } : {}),
      })),
    },
    null,
    2,
  )}\n`;

  return { json, md };
}

/** Compare a freshly built index against what is on disk. */
export function diffIndex(
  built: BuiltIndex,
  onDisk: OnDiskIndex,
  options: IndexDiffOptions,
): string[] {
  const problems: string[] = [];
  const hint = `run \`${options.checkWriteCommand}\``;
  const jsonFile = `${options.root}/index.generated.json`;
  const mdFile = `${options.root}/index.generated.md`;

  if (onDisk.json === null) {
    problems.push(`missing: ${jsonFile} — ${hint}`);
  } else if (onDisk.json.replace(/\r\n/g, '\n') !== built.json) {
    problems.push(`stale: ${jsonFile} — ${hint}`);
  }

  if (onDisk.md === null) {
    problems.push(`missing: ${mdFile} — ${hint}`);
  } else if (onDisk.md.replace(/\r\n/g, '\n') !== built.md) {
    problems.push(`stale: ${mdFile} — ${hint}`);
  }

  return problems;
}
