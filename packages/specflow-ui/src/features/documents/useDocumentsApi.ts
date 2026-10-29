import type { SpecFlowAppServices } from '../../services';
import { useAppServices } from '../../app/useAppServices';
import { useRuntimeMode, type RuntimeMode } from '../../app/useRuntimeMode';
import type { DocumentsApi } from './api';

/** Which adapter of the documents port serves a Runtime mode. */
export type DocumentsApiKind = 'demo' | 'project';

/**
 * The adapter for a Runtime mode: the project Runtime's real routes, or the demo emulation. The
 * workspace renders only once the mode is known (`DocumentsLayout`); a harness without Runtime
 * info (loading or unavailable) has no project Runtime behind it and gets the demo adapter.
 */
export const documentsApiKind = (mode: RuntimeMode): DocumentsApiKind =>
  mode === 'project' ? 'project' : 'demo';

export function documentsApiFor(services: SpecFlowAppServices, kind: DocumentsApiKind) {
  return kind === 'project' ? services.projectDocumentsApi : services.demoDocumentsApi;
}

/**
 * The documents port of the connected Runtime. The only place the documents feature decides by
 * Runtime mode; everything above it (hooks, components) is shared by both modes.
 */
export function useDocumentsApi(): { api: DocumentsApi; kind: DocumentsApiKind } {
  const services = useAppServices();
  const kind = documentsApiKind(useRuntimeMode());

  return { api: documentsApiFor(services, kind), kind };
}
