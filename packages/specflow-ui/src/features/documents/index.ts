/**
 * Public API of the documents feature: the only module other features may import for document UI.
 * Cache keys are in `documents/read-model`.
 */
export { DocumentContent } from './content/DocumentContent';
export { DocumentDescription, descriptionScrollOwner } from './description/DocumentDescription';
export { markdownIntro } from './description/markdownIntro';
export { restoreScrollPosition } from './description/restoreScrollPosition';
