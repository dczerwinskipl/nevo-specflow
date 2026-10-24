import type { ArchetypeCatalogue } from '@nevo/specflow-contracts/documents';

import { getBuiltInCatalogue, type ResolvedCatalogue } from './catalogue';

/**
 * The catalogue in its public (contract) shape: the resolved definitions plus `revision`. A template
 * `title` defaults to the title of its document type, and the catalogue `documents[].id` is the
 * template id. No default archetype is named (the client chooses) and `workflow` is demo-only.
 */
export function projectCatalogue(
  catalogue: ResolvedCatalogue = getBuiltInCatalogue(),
): ArchetypeCatalogue {
  const titleOfType = (id: string): string => catalogue.findDocumentType(id)?.title ?? id;
  return {
    revision: catalogue.revision,
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
