import type { SpecFlowEngine } from '../../../application';
import type { SpecificationManifest } from '../../model';
import { documentChangeError } from '../changes/errors';
import type {
  CreateRequest,
  DocumentChangeRequest,
  DocumentWriteRequest,
  UnresolvedCreateRequest,
} from '../changes/plan/request';

/**
 * Renders the template entries of a create for a Specification. Admission depends on this port only,
 * so it stays independent of the catalogue and the archetypes; the composition (`documents/api`)
 * supplies the implementation that reads the project's definitions.
 */
export type TemplateResolver = (
  engine: SpecFlowEngine,
  manifest: SpecificationManifest,
  request: UnresolvedCreateRequest,
) => Promise<{ readonly request: CreateRequest; readonly catalogueRevision: string }>;

/** True when the request is a create with at least one entry that names a template. */
export function namesTemplates(request: DocumentWriteRequest): request is UnresolvedCreateRequest {
  return request.action === 'create' && request.documents.some((e) => e.templateId !== undefined);
}

/** The planner request of a write request that names no template. */
export function asPlannerRequest(request: DocumentWriteRequest): DocumentChangeRequest {
  if (request.action !== 'create') {
    return request;
  }

  return { ...request, documents: request.documents as CreateRequest['documents'] };
}

/** The refusal of a template create where no resolver was supplied. */
export function templatesUnavailable(): Error {
  return documentChangeError('operation-invalid', 'Templates are not available here.');
}
