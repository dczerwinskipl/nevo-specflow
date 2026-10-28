import type { ArchetypeCatalogue } from '@nevo/specflow-contracts/documents';

import type { ProjectCatalogue } from '../definitions/project-catalogue';

/**
 * The catalogue in its public (contract) shape: the resolved definitions plus `revision`. A template
 * `title` defaults to the title of its document type, and the catalogue `documents[].id` is the
 * template id. No default archetype is named (the client chooses) and `workflow` is demo-only.
 * `problems` is reported only when the caller passes the problems of the project catalogue.
 */
export function toArchetypeCatalogue(
  source: Pick<ProjectCatalogue, 'catalogue'> &
    Partial<Pick<ProjectCatalogue, 'problems' | 'problemsTruncated'>> & {
      readonly unstableRead?: boolean;
    },
): ArchetypeCatalogue {
  const { catalogue } = source;
  const titleOfType = (id: string): string => catalogue.findDocumentType(id)?.title ?? id;
  return {
    revision: catalogue.revision,
    ...(source.problems !== undefined && source.problems.length > 0
      ? { problems: [...source.problems], problemsTruncated: source.problemsTruncated === true }
      : {}),
    ...(source.unstableRead === true ? { unstableRead: true } : {}),
    documentTypes: catalogue.documentTypes.map((type) => ({
      id: type.id,
      title: type.title,
      description: type.description,
      useWhen: type.useWhen,
      instructions: type.instructions,
      ...(type.defaultFilename !== undefined ? { defaultFilename: type.defaultFilename } : {}),
    })),
    archetypes: catalogue.archetypes.map((archetype) => ({
      id: archetype.id,
      version: archetype.version,
      title: archetype.title,
      description: archetype.description,
      useWhen: archetype.useWhen,
      ...(archetype.instructions !== undefined ? { instructions: archetype.instructions } : {}),
      requirements: archetype.requirements.map((item) => ({
        documentType: item.documentType,
        minCount: item.minCount,
      })),
      documents: archetype.templates.map((template) => ({
        id: template.id,
        type: template.documentType,
        title: template.title ?? titleOfType(template.documentType),
        filename: template.filename,
        include: template.include,
        ...(template.include === 'optional' && template.preselected !== undefined
          ? { preselected: template.preselected }
          : {}),
        ...(template.instructions !== undefined ? { instructions: template.instructions } : {}),
        content: template.content,
      })),
    })),
  };
}
