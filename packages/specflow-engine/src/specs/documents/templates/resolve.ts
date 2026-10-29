import type { SpecificationManifest } from '../../model';
import { renderTemplate, templateValues } from '../../archetypes/template-renderer';
import { getStableProjectCatalogue } from '../../definitions/catalogue-source';
import { requireArchetype } from '../../definitions/archetype-lookup';
import type { ProjectCatalogue } from '../../definitions/project-catalogue';
import { TEMPLATE_TEXT_MAX_BYTES } from '../limits';
import { documentChangeError } from '../changes/errors';
import type { CreateEntry, CreateRequest, UnresolvedCreateRequest } from '../changes/plan/request';
import type { TemplateResolver } from '../write/template-port';

/**
 * Renders the template entries of a create from the project catalogue and returns the request the
 * planner takes. Pure: the catalogue is passed in. The Specification keeps no goal, so `{{goal}}` is
 * empty and `{{goalOrPrompt}}` is the fixed prompt; title, slug and creation date come from its
 * manifest.
 *
 * Order of refusals: no usable archetype at all (`DEFINITIONS_MISSING`), a missing revision
 * (`DOCUMENT_OPERATION_INVALID`), a revision that differs from the current one (`CATALOGUE_STALE`),
 * the Specification's archetype not defined (`ARCHETYPE_UNKNOWN`), a template id the archetype does
 * not have (`ARCHETYPE_UNKNOWN`, `template-unknown`), a type that is not the template's
 * (`DOCUMENT_OPERATION_INVALID`).
 */
export function resolveTemplateEntries(
  manifest: SpecificationManifest,
  request: UnresolvedCreateRequest,
  project: ProjectCatalogue,
): CreateRequest {
  if (project.catalogue.archetypes.length === 0) requireArchetype(project, manifest.archetype.id);
  if (request.catalogueRevision === undefined) {
    throw documentChangeError('operation-invalid', 'A template create needs a catalogue revision.');
  }
  if (request.catalogueRevision !== project.catalogue.revision) {
    throw documentChangeError('catalogue-stale', 'The catalogue changed since it was read.');
  }
  const archetype = requireArchetype(project, manifest.archetype.id);
  const values = templateValues({
    title: manifest.title,
    slug: manifest.slug,
    created: manifest.created ?? '',
  });
  const documents: CreateEntry[] = request.documents.map((entry) => {
    if (entry.templateId === undefined) return entry as CreateEntry;
    const template = archetype.templates.find((candidate) => candidate.id === entry.templateId);
    if (template === undefined) {
      throw documentChangeError(
        'template-unknown',
        `Archetype "${archetype.id}" has no template "${entry.templateId}".`,
      );
    }
    if (entry.type !== undefined && entry.type !== template.documentType) {
      throw documentChangeError(
        'operation-invalid',
        'The type of a template document is the type of the template.',
      );
    }
    const content = renderTemplate(template.content, values);
    if (Buffer.byteLength(content, 'utf8') > TEMPLATE_TEXT_MAX_BYTES) {
      throw documentChangeError('too-large', 'A rendered template exceeds the content limit.');
    }
    return {
      path: entry.path ?? template.filename,
      type: template.documentType,
      templateId: template.id,
      content,
    };
  });
  return { ...request, documents, folders: request.folders };
}

/**
 * The template resolver of this Engine: reads the project catalogue of the Project Home and renders
 * the template entries of a create. The composition (`documents/api`) hands it to the writer; the
 * writer's admission knows only the {@link TemplateResolver} port.
 */
export const catalogueTemplateResolver: TemplateResolver = async (engine, manifest, request) => {
  const project = await getStableProjectCatalogue(engine);
  return {
    request: resolveTemplateEntries(manifest, request, project),
    catalogueRevision: project.catalogue.revision,
  };
};
