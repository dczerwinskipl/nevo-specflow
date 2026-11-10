/** Filterable metadata a consumer attaches to a unit; the engine never interprets it. */
export type UnitMetadataValue = string | number | boolean | readonly string[];
export type UnitMetadata = Readonly<Record<string, UnitMetadataValue>>;

/**
 * One chunk-able unit of a corpus (for documentation: one document).
 *
 * `text` is the markdown body without any consumer envelope (for example frontmatter). `header` is a
 * short consumer-built context line block (for documentation: title, id, summary, tags) that is
 * embedded with every chunk of the unit so small chunks keep their unit context.
 */
export interface SourceUnit {
  readonly id: string;
  /** Consumer-computed hash of everything the unit's chunks derive from (text and header). */
  readonly contentHash: string;
  readonly text: string;
  readonly header: string;
  readonly metadata: UnitMetadata;
}

/** Enumerates the units of a corpus. The consumer provides it. */
export interface ChunkSource {
  listUnits(): Promise<readonly SourceUnit[]>;
}

/** A searchable piece of a unit produced by the chunker. */
export interface Chunk {
  /** Stable for unchanged content: derived from the unit id and the heading path, not a position. */
  readonly id: string;
  readonly unitId: string;
  readonly headingPath: readonly string[];
  /** Id of the chunk's section within its unit (`MarkdownSection.id`); the parts of one share it. */
  readonly sectionId: string;
  /** 1-based line of the section's heading in the unit text (`MarkdownSection.startLine`). */
  readonly startLine: number;
  /** The section markdown (heading line included); what lexical ranking and snippets use. */
  readonly text: string;
  /** Unit header, heading path and text: what the embedding provider receives for this chunk. */
  readonly embeddingText: string;
  /** Hash of `embeddingText` and the chunker version; changes exactly when the vector must. */
  readonly contentHash: string;
  readonly metadata: UnitMetadata;
}
