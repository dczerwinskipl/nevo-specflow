import { createHash } from 'node:crypto';
import type { PolicyReason } from '@nevo/specflow-engine';

/** One file of a demo Specification directory. */
export interface DemoFile {
  readonly bytes: Uint8Array;
  /** sha256 of the bytes (like the Engine), or a fixed seed revision other demo data refers to. */
  readonly revision: string;
}

/** One registry entry of the manifest: stable id, path and document type. */
export interface DemoRegistryEntry {
  readonly id: string;
  readonly path: string;
  readonly type: string;
}

/**
 * The in-memory equivalent of a Specification directory: the manifest's archetype snapshot, registry
 * and explicit folders, plus the files on disk. Everything a client sees (tree, content, raw) is
 * projected from it with the Engine's own rules; writes replace whole fields after validation.
 */
export interface DemoSpecDocuments {
  readonly archetype: {
    readonly id: string;
    readonly version: number;
    readonly requirements: readonly { readonly documentType: string; readonly minCount: number }[];
  };
  readonly archetypeTitle?: string;
  registry: DemoRegistryEntry[];
  /** Explicit (manifest) folders that may hold no file. */
  folders: string[];
  /** Files by exact path. */
  files: Map<string, DemoFile>;
  readonly location: 'active' | 'archive';
  /** The advisory Git policy reason of the checked-out branch (writes refused with it). */
  readonly policyReason?: PolicyReason;
  /** The canonical (UUID) Specification id later registered ids are allocated from. */
  readonly allocationId: string;
  /** Template placeholders of documents created from a template later. */
  readonly title: string;
  readonly slug: string;
  readonly created: string;
  /** A write is committing (with the optional demo latency): other writes are `SPEC_BUSY`. */
  busy: boolean;
}

export const sha256 = (bytes: Uint8Array | string) =>
  createHash('sha256').update(bytes).digest('hex');

export const textFile = (text: string, revision?: string): DemoFile => {
  const bytes = new TextEncoder().encode(text);
  return { bytes, revision: revision ?? sha256(bytes) };
};

export const binaryFile = (bytes: Uint8Array, revision?: string): DemoFile => ({
  bytes,
  revision: revision ?? sha256(bytes),
});

export const decodeText = (bytes: Uint8Array) => new TextDecoder('utf-8').decode(bytes);

export const foldKey = (path: string) => path.toLowerCase();

/** `path` equals `folder` or lies below it (case-insensitive, like the Engine's path keys). */
export const within = (path: string, folder: string) =>
  foldKey(path) === foldKey(folder) || foldKey(path).startsWith(foldKey(folder) + '/');

export const parentOf = (path: string) =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';

export const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

export const joinPath = (folder: string, name: string) => (folder ? folder + '/' + name : name);

/** Every ancestor folder of a path (`a/b/c.md` gives `a`, `a/b`). */
export function ancestors(path: string): string[] {
  const parts = path.split('/');
  return parts.slice(0, -1).map((_part, index) => parts.slice(0, index + 1).join('/'));
}

/** Every folder of the directory: the explicit ones and the ancestors of every file. */
export function allFolders(documents: Pick<DemoSpecDocuments, 'files' | 'folders'>): string[] {
  const folders = new Map<string, string>();
  for (const folder of documents.folders) {
    for (const ancestor of [...ancestors(folder + '/x')])
      if (!folders.has(foldKey(ancestor))) folders.set(foldKey(ancestor), ancestor);
  }
  for (const path of documents.files.keys())
    for (const ancestor of ancestors(path))
      if (!folders.has(foldKey(ancestor))) folders.set(foldKey(ancestor), ancestor);
  return [...folders.values()].sort((left, right) =>
    foldKey(left) < foldKey(right) ? -1 : foldKey(left) > foldKey(right) ? 1 : 0,
  );
}

/** Canonical bytes of the manifest part a tree revision depends on. */
export function manifestBytes(documents: DemoSpecDocuments): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      archetype: documents.archetype,
      registry: documents.registry,
      folders: documents.folders,
    }),
  );
}
