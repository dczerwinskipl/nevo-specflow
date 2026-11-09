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
  type DocsSettings,
  type DocsTaxonomy,
} from './config/docs-settings';
export { loadDocsSettings, type DocsConfigPaths } from './config/load-docs-settings';
export {
  createFileSystemDocRepository,
  type DocRepository,
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
  documentAnchors,
  extractLinks,
  slugifyHeading,
  validateLinks,
  type MarkdownLink,
  type PathExists,
} from './links/links';
