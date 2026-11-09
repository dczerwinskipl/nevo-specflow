// Public surface of @nevo/specflow-docs (ADR 0020). The Commander adapter is the `./cli` export.

export * from './errors';
export {
  asString,
  INACTIVE_STATUSES,
  isInactiveStatus,
  KNOWN_STATUSES,
  KNOWN_TYPES,
  parseFrontmatter,
  REQUIRED_FIELDS,
  type DocRecord,
  type DocStatus,
  type DocType,
  type ParsedMarkdown,
} from './frontmatter/contract';
export { validateCorpus, validateDoc } from './frontmatter/validate';
export {
  DEFAULT_DOCS_SETTINGS,
  isNonAuthoritative,
  parseDocsConfig,
  type DocsSearchSettings,
  type DocsSettings,
  type DocsTaxonomy,
} from './config/docs-settings';
export {
  EMBEDDINGS_PROTOCOLS,
  type EmbeddingsProtocol,
  type EmbeddingsSettings,
} from './config/embeddings-settings';
export {
  parseDocsConfiguration,
  type DocsConfiguration,
  type DocsConfigurationSources,
} from './config/docs-configuration';
export { loadDocsSettings, type DocsConfigPaths } from './config/load-docs-settings';
export {
  createFileSystemDocRepository,
  type DocRepository,
  type MarkdownFileStat,
  type FileSystemDocRepositoryOptions,
  type ScanResult,
} from './corpus/repository';
export {
  collectCorpusProblems,
  inspectCorpus,
  loadValidatedCorpus,
  openFileSystemCorpus,
  type DocsCorpus,
  type DocsCorpusRules,
} from './corpus/corpus';
export {
  normalizeTerm,
  scoreDoc,
  searchDocs,
  tokenize,
  type ScoreResult,
  type ScoredDoc,
  type SearchOptions,
} from './discovery/search';
export {
  findDocuments,
  getContext,
  getDocuments,
  type ContextEntry,
  type FindOptions,
} from './discovery/documents';
export {
  buildIndex,
  diffIndex,
  INDEX_REGENERATE_COMMAND,
  type BuiltIndex,
  type IndexDiffOptions,
  type IndexOptions,
  type OnDiskIndex,
} from './index-file/index-file';
export { checkDocumentation, type CheckResult } from './index-file/check';
export {
  CHUNKS_PER_RESULT,
  openDocsSearch,
  searchDocumentation,
  snippet,
  type DocsSearch,
  type DocsSearchRequest,
  type DocsSearchVectors,
  type OpenDocsSearchOptions,
} from './semantic/docs-search';
export { DOCS_INDEX_DIRECTORY, openDocsIndex, type DocsIndex } from './semantic/docs-index';
export {
  createDocsChunkSource,
  type DocsChunk,
  type DocsChunkMetadata,
  type DocsChunks,
  type DocsChunkSource,
} from './semantic/docs-chunk-source';
export {
  QUERY_TIMEOUT_MS,
  type CreateEmbeddingProvider,
  type EmbeddingProviders,
} from './semantic/embedding-providers';
export {
  buildDocsIndex,
  semanticStatus,
  type EndpointReachability,
  type IndexState,
  type SemanticEnvironment,
  type SemanticIndexResult,
  type SemanticStatus,
} from './semantic/semantic-index';
export {
  documentAnchors,
  extractLinks,
  slugifyHeading,
  validateLinks,
  type MarkdownLink,
  type PathExists,
} from './links/links';
