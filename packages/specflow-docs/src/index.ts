// Public surface of @nevo/specflow-docs (ADR 0020): what the product shell, Runtime and this
// repository's `tools/docs` launcher consume. The Commander adapter is the `./cli` export.

export * from './errors';
export {
  asString,
  isInactiveStatus,
  parseFrontmatter,
  type DocRecord,
} from './frontmatter/contract';
export { validateDoc } from './frontmatter/validate';
export { DEFAULT_DOCS_SETTINGS } from './config/docs-settings';
export { parseDocsConfiguration, type DocsConfiguration } from './config/docs-configuration';
export { loadDocsSettings } from './config/load-docs-settings';
export { initDocs } from './init/docs-init';
export { getContext, type ContextEntry } from './discovery/documents';
export {
  inspectCorpus,
  openFileSystemCorpus,
  type DocsCorpus,
  type DocsCorpusRules,
} from './corpus/corpus';
export { buildIndex } from './validation/generated-index';
export {
  openDocsSearch,
  searchDocumentation,
  type DocsSearch,
  type DocsSearchRequest,
} from './search/search';
export {
  checkIndexAccess,
  openDocsIndex,
  openProjectIndex,
  type DocsIndex,
  type GitIgnoreCheck,
  type IndexAccess,
} from './semantic-index/index-store';
export { type CreateEmbeddingProvider } from './embeddings/embedding-providers';
export {
  buildDocsIndex,
  type IndexProgress,
  type SemanticIndexResult,
} from './semantic-index/build';
export { type IndexCatchUp } from './semantic-index/catch-up';
export { readIndexActivity } from './semantic-index/progress';
export { createReachabilityCache, type ReachabilityCache } from './semantic-index/reachability';
export { semanticStatus } from './semantic-index/status';
