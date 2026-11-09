export type {
  ApplyOutcome,
  Chunk,
  ChunkSource,
  EmbeddingFailure,
  EmbeddingFailureCode,
  EmbeddingProvider,
  EmbeddingPurpose,
  EmbeddingResult,
  IndexIdentity,
  IndexManifest,
  ManifestOutcome,
  ProbeResult,
  SourceUnit,
  StoreUnreadable,
  UnitMetadata,
  UnitMetadataValue,
  VectorEntry,
  VectorMatch,
  VectorQuery,
  VectorQueryOutcome,
  VectorStore,
  VectorStoreChange,
} from './ports';
export {
  CHUNKER_VERSION,
  CHUNK_MAX_CHARS,
  CHUNK_OVERLAP_CHARS,
  chunkMarkdownUnit,
} from './markdown-chunker';
export {
  DEFAULT_EMBEDDING_BATCH_SIZE,
  DEFAULT_EMBEDDING_TIMEOUT_MS,
  OPENAI_COMPATIBLE_PROTOCOL,
  PROBE_TEXT,
  createOpenAiCompatibleEmbeddingProvider,
  type OpenAiCompatibleEmbeddingDependencies,
  type OpenAiCompatibleEmbeddingSettings,
} from './openai-compatible-embeddings';
export {
  SEARCH_REASON,
  VECTOR_CANDIDATES_PER_RESULT,
  createSearchEngine,
  type ChunkHit,
  type SearchEngine,
  type SearchReason,
  type SearchRequest,
  type SearchResult,
  type SearchVectors,
  type UnitHit,
} from './search';
export { sameIdentity, validateChange } from './vector-store-contract';
export { cosineSimilarity, nearestNeighbours, type VectorCandidate } from './vector-math';
