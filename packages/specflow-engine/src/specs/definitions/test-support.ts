import { stringify } from 'yaml';

import {
  pathSegments,
  type DefinitionSource,
  type ListOutcome,
  type ReadOutcome,
  type SourceEntry,
  type SourceEntryType,
  type StatOutcome,
} from './source';
import type { DefinitionWriter, WriteOptions } from './writer';

interface MemoryNode {
  type: Exclude<SourceEntryType, 'directory'>;
  bytes: Buffer;
  mtimeNs: bigint;
  ctimeNs: bigint;
  ino: bigint;
}

function newer(left: bigint | undefined, right: bigint): bigint {
  return left !== undefined && left > right ? left : right;
}

/**
 * An in-memory definitions tree: the same seam as the filesystem source, with deterministic stat
 * values that change on every write (a logical clock, in nanoseconds, replaceable). Used by unit tests
 * of the loader, the stat memo and the install planner, and by tools that assemble a catalogue in
 * memory. Directories are implied by the paths of the entries below them; a path may be marked as a
 * symlink or a special file to exercise the safety rules.
 */
export class MemoryDefinitionSource implements DefinitionSource, DefinitionWriter {
  private readonly nodes = new Map<string, MemoryNode>();
  private readonly unsafeDirectories = new Set<string>();
  private nextIno = 1n;
  private tickNs = 1_000_000_000n;
  /** Number of `list` and `read` calls, for tests that assert the cost of a lookup. */
  readonly calls = { list: 0, read: 0, stat: 0 };

  constructor(files: Readonly<Record<string, string | Uint8Array>> = {}) {
    for (const [path, content] of Object.entries(files)) this.set(path, content);
  }

  /** Logical clock in nanoseconds; tests set it to simulate "modified just now". */
  setClockNs(value: bigint): void {
    this.tickNs = value;
  }

  private stamp(): bigint {
    this.tickNs += 1_000_000n;
    return this.tickNs;
  }

  set(path: string, content: string | Uint8Array): void {
    const bytes = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content);
    const existing = this.nodes.get(path);
    const now = this.stamp();
    this.nodes.set(path, {
      type: 'file',
      bytes,
      mtimeNs: now,
      ctimeNs: now,
      ino: existing?.ino ?? this.nextIno++,
    });
  }

  /** Change the modification time of an entry without changing its content. */
  touch(path: string, atNs?: bigint): void {
    const node = this.nodes.get(path);
    if (!node) throw new Error(`No entry ${path}.`);
    const now = atNs ?? this.stamp();
    node.mtimeNs = now;
    node.ctimeNs = now;
  }

  setSymlink(path: string): void {
    this.nodes.set(path, { type: 'symlink', bytes: Buffer.alloc(0), ...this.fresh() });
  }

  setSpecial(path: string): void {
    this.nodes.set(path, { type: 'other', bytes: Buffer.alloc(0), ...this.fresh() });
  }

  /** Mark a directory path as a symlink or otherwise unsafe directory. */
  setUnsafeDirectory(path: string): void {
    this.unsafeDirectories.add(path);
  }

  delete(path: string): void {
    this.nodes.delete(path);
  }

  has(path: string): boolean {
    return this.nodes.has(path);
  }

  text(path: string): string | undefined {
    return this.nodes.get(path)?.bytes.toString('utf8');
  }

  paths(): string[] {
    return [...this.nodes.keys()].sort();
  }

  private fresh(): { mtimeNs: bigint; ctimeNs: bigint; ino: bigint } {
    const now = this.stamp();
    return { mtimeNs: now, ctimeNs: now, ino: this.nextIno++ };
  }

  writeAtomic(path: string, bytes: Uint8Array, options: WriteOptions = {}): Promise<void> {
    if (options.exclusive === true && this.nodes.has(path)) {
      return Promise.reject(new Error(`The file ${path} exists.`));
    }
    this.set(path, bytes);
    return Promise.resolve();
  }

  list(directory: string, maxEntries: number): Promise<ListOutcome> {
    this.calls.list += 1;
    if (this.unsafeDirectories.has(directory)) return Promise.resolve({ state: 'unsafe' });
    const prefix = directory === '' ? '' : `${directory}/`;
    const children = new Map<string, SourceEntry>();
    for (const [path, node] of this.nodes) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const [first, ...tail] = rest.split('/');
      if (first === undefined || first === '') continue;
      if (tail.length === 0) {
        children.set(first, {
          name: first,
          type: node.type,
          size: node.bytes.length,
          mtimeNs: node.mtimeNs,
          ctimeNs: node.ctimeNs,
          ino: node.ino,
        });
      } else {
        const current = children.get(first);
        if (current !== undefined && current.type !== 'directory') continue;
        children.set(first, {
          name: first,
          type: this.unsafeDirectories.has(`${prefix}${first}`) ? 'symlink' : 'directory',
          size: 0,
          mtimeNs: newer(current?.mtimeNs, node.mtimeNs),
          ctimeNs: newer(current?.ctimeNs, node.ctimeNs),
          ino: 0n,
        });
      }
    }
    if (children.size === 0 && !this.hasDirectory(directory)) {
      return Promise.resolve({ state: 'absent' });
    }
    if (children.size > maxEntries) return Promise.resolve({ state: 'overflow' });
    return Promise.resolve({
      state: 'ok',
      entries: [...children.values()],
    });
  }

  private hasDirectory(directory: string): boolean {
    if (directory === '') return this.nodes.size > 0;
    const prefix = `${directory}/`;
    for (const path of this.nodes.keys()) if (path.startsWith(prefix)) return true;
    return false;
  }

  read(path: string, maxBytes: number): Promise<ReadOutcome> {
    this.calls.read += 1;
    for (let length = 1; length < pathSegments(path).length; length += 1) {
      const ancestor = pathSegments(path).slice(0, length).join('/');
      if (this.unsafeDirectories.has(ancestor) || this.nodes.get(ancestor)?.type === 'symlink') {
        return Promise.resolve({ state: 'unsafe' });
      }
    }
    const node = this.nodes.get(path);
    if (!node) return Promise.resolve({ state: 'absent' });
    if (node.type === 'symlink') return Promise.resolve({ state: 'unsafe' });
    if (node.type !== 'file') return Promise.resolve({ state: 'not-regular' });
    if (node.bytes.length > maxBytes) return Promise.resolve({ state: 'too-large' });
    return Promise.resolve({ state: 'ok', bytes: Buffer.from(node.bytes) });
  }

  stat(path: string): Promise<StatOutcome> {
    this.calls.stat += 1;
    const node = this.nodes.get(path);
    if (!node) return Promise.resolve({ state: 'absent' });
    if (node.type === 'symlink') return Promise.resolve({ state: 'unsafe' });
    if (node.type !== 'file') return Promise.resolve({ state: 'not-regular' });
    return Promise.resolve({
      state: 'ok',
      entry: {
        name: pathSegments(path).at(-1) ?? '',
        type: 'file',
        size: node.bytes.length,
        mtimeNs: node.mtimeNs,
        ctimeNs: node.ctimeNs,
        ino: node.ino,
      },
    });
  }
}

/**
 * Builders of definition files for the unit tests of this folder. Plain objects are serialised with
 * the YAML library, so a test overrides or removes one field and the rest stays valid.
 */

export type Fields = Record<string, unknown>;

export function documentTypeFile(id: string, overrides: Fields = {}): string {
  return toYaml({
    kind: 'document-type',
    schemaVersion: 1,
    id,
    title: id.charAt(0).toUpperCase() + id.slice(1),
    description: `The ${id} document.`,
    useWhen: `The work needs ${id}.`,
    instructions: `Write the ${id} document.`,
    defaultFilename: `${id}.md`,
    ...overrides,
  });
}

export const OVERVIEW_TEMPLATE_TEXT =
  '---\r\nid: spec.{{slug}}\r\n---\r\n\r\n# {{specificationTitle}}\r\n';

export function overviewTemplate(overrides: Fields = {}): Fields {
  return {
    id: 'overview',
    documentType: 'overview',
    filename: 'overview.md',
    include: 'always',
    contentFile: 'templates/overview.md',
    ...overrides,
  };
}

export function archetypeFile(id: string, overrides: Fields = {}): string {
  return toYaml({
    kind: 'specification-archetype',
    schemaVersion: 1,
    id,
    version: 1,
    title: id.charAt(0).toUpperCase() + id.slice(1),
    description: `The ${id} archetype.`,
    useWhen: `The work is ${id}.`,
    requirements: [{ documentType: 'overview', minCount: 1 }],
    templates: [
      overviewTemplate(),
      {
        id: 'note',
        documentType: 'note',
        filename: 'note.md',
        include: 'optional',
        preselected: true,
        content: '# {{specificationTitle}} - Note\n',
      },
    ],
    ...overrides,
  });
}

export function toYaml(value: unknown): string {
  return stringify(value, { lineWidth: 0 });
}

/** A small valid project: document types `overview` and `note`, archetype `minimal` with its template file. */
export function sampleProject(): MemoryDefinitionSource {
  return new MemoryDefinitionSource({
    'document-type/overview.yaml': documentTypeFile('overview'),
    'document-type/note.yaml': documentTypeFile('note'),
    'specification-archetype/minimal.yaml': archetypeFile('minimal'),
    'specification-archetype/templates/overview.md': OVERVIEW_TEMPLATE_TEXT,
  });
}
