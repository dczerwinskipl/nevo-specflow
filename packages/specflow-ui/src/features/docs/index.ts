/**
 * The documentation reader of one registered workspace. Its data (port, query keys, read hooks)
 * is the `read-model` entry; this barrel adds the tab's current workspace and the policies of the
 * references in a document.
 */
export {
  type CurrentWorkspaceSource,
  type CurrentWorkspaceState,
  type WorkspaceFallbackNotice,
} from './current-workspace/currentWorkspace';
export {
  createCurrentWorkspaceStore,
  currentDocsWorkspace,
  type CurrentWorkspaceStore,
} from './current-workspace/currentWorkspaceStore';
export {
  useCurrentDocsWorkspace,
  type CurrentDocsWorkspace,
  type UseCurrentDocsWorkspaceOptions,
} from './current-workspace/useCurrentDocsWorkspace';
export { inertImage, type InertImage } from './links/imagePolicy';
export {
  createDocsLinkIndex,
  resolveDocsLink,
  topSectionId,
  type DocsLinkIndex,
  type DocsLinkTarget,
  type InertLinkReason,
} from './links/linkPolicy';
export {
  createDocsReferenceRenderers,
  useDocsReferenceRenderers,
  type DocsReferenceContext,
  type DocsReferenceRenderers,
  type DocsReferenceViews,
} from './links/useDocsReferenceRenderers';
export { useSpecificationDocsWorkspace } from './entries/useSpecificationDocsWorkspace';
