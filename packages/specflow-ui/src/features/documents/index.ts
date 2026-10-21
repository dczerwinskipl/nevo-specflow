/** Public API of the documents feature: the only module other features may import. */
export { DocumentContent } from './content/DocumentContent';
export { DocumentDescription, descriptionScrollOwner } from './description/DocumentDescription';
export { markdownIntro } from './description/markdownIntro';
export { restoreScrollPosition } from './description/restoreScrollPosition';
export { documentKeys } from './queries';
