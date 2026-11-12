// Public surface of @nevo/specflow-docs (ADR 0020): what the product shell, Runtime and this
// repository's `tools/docs` launcher consume. The Commander adapter is the `./cli` export.

export * from './errors';
export { asString, parseFrontmatter, type DocRecord } from './frontmatter/contract';
export { validateDoc } from './frontmatter/validate';
export { DEFAULT_DOCS_SETTINGS } from './config/docs-settings';
export { parseDocsConfiguration, type DocsConfiguration } from './config/docs-configuration';
export { loadDocsSettings } from './config/load-docs-settings';
export { initDocs } from './init/docs-init';
export { getContext, type ContextEntry, type Skipping } from './discovery/documents';
export { type SkippedDocument } from './corpus/readable';
export {
  inspectCorpus,
  openCorpus,
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
  type IndexAccess,
} from './semantic-index/index-store';
export {
  type AdmitWrite,
  type GitIgnoreCheck,
  type IndexWrites,
} from './semantic-index/write-admission';
export { type CreateEmbeddingProvider } from './embeddings/embedding-providers';
export {
  buildDocsIndex,
  type IndexProgress,
  type SemanticIndexResult,
} from './semantic-index/build';
export { type IndexCatchUp } from './semantic-index/catch-up';
export {
  seedIndexIfMissing,
  type ConfiguredSeedIdentity,
  type SeedOutcome,
  type SeedSource,
} from './semantic-index/seed';
export { readIndexActivity } from './semantic-index/progress';
export { createReachabilityCache, type ReachabilityCache } from './semantic-index/reachability';
export { semanticStatus } from './semantic-index/status';
export {
  readCheckoutDocsSettings,
  type CheckoutDocsSettings,
  type ReadCheckoutDocsSettingsOptions,
} from './reader/settings';
export {
  readArticle,
  type ArticleDocument,
  type ArticleResult,
  type ArticleSection,
  type RelatedDocument,
  type RelatedState,
} from './reader/article';
export {
  projectDocsTree,
  type DocsTree,
  type TreeDocument,
  type TreeInactiveDocument,
  type TreeSkippedDocument,
} from './reader/tree';
export { type DocsChunks } from './semantic-index/chunk-source';
export { searchDocumentationWithLeftOut, type DocsSearchWithLeftOut } from './search/search';
