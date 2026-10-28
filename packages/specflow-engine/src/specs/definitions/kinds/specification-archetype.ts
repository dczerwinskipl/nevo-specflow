import {
  SpecificationArchetypeDefinitionFileSchema,
  findArchetypeFileLimitViolations,
  type ArchetypeDefinition,
  type SpecificationArchetypeDefinitionFile,
  type TemplateDefinition,
} from '@nevo/specflow-contracts/documents';

import {
  DERIVED_ID_PREFIX,
  OVERVIEW_DOCUMENT_ID,
  OVERVIEW_DOCUMENT_PATH,
  OVERVIEW_DOCUMENT_TYPE,
  foldPathKey,
  validateDocumentPath,
} from '../../document-rules';
import { ARCHETYPES_MAX, ARCHETYPE_TEMPLATES_MAX } from '../limits';
import {
  defineDefinitionKind,
  type DefinitionCheckContext,
  type DefinitionIssue,
} from '../kind-registry';
import { DOCUMENT_TYPE_KIND } from './document-type';

export const SPECIFICATION_ARCHETYPE_KIND = 'specification-archetype';

/** Directory of the template files, below the kind directory. */
export const ARCHETYPE_TEMPLATES_DIRECTORY = 'templates';

function referenceIssue(
  context: DefinitionCheckContext,
  documentType: string,
  location: string,
): DefinitionIssue | undefined {
  const found = context.lookup(DOCUMENT_TYPE_KIND, documentType);
  if (found.state === 'valid') return undefined;
  return found.state === 'missing'
    ? {
        code: 'reference-missing',
        location,
        message: `The document type "${documentType}" is not defined.`,
      }
    : {
        code: 'reference-invalid',
        location,
        message: `The document type "${documentType}" is defined but invalid.`,
      };
}

function archetypeIssues(
  archetype: ArchetypeDefinition,
  context: DefinitionCheckContext,
): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];

  if (archetype.templates.length > ARCHETYPE_TEMPLATES_MAX) {
    issues.push({
      code: 'limit-exceeded',
      location: '/templates',
      message: `The archetype has ${archetype.templates.length} templates; at most ${ARCHETYPE_TEMPLATES_MAX} are allowed.`,
    });
  }

  const required = new Set<string>();
  archetype.requirements.forEach((requirement, index) => {
    const location = `/requirements/${index}/documentType`;
    if (required.has(requirement.documentType)) {
      issues.push({
        code: 'schema-invalid',
        location,
        message: `The document type "${requirement.documentType}" is required more than once.`,
      });
    }
    required.add(requirement.documentType);
    const missing = referenceIssue(context, requirement.documentType, location);
    if (missing) issues.push(missing);
  });
  if (
    !archetype.requirements.some(
      (requirement) =>
        requirement.documentType === OVERVIEW_DOCUMENT_TYPE && requirement.minCount >= 1,
    )
  ) {
    issues.push({
      code: 'requirement-overview-missing',
      location: '/requirements',
      message: `Every archetype must require the "${OVERVIEW_DOCUMENT_TYPE}" document type at least once.`,
    });
  }

  const templateIds = new Set<string>();
  const filenames = new Set<string>();
  archetype.templates.forEach((template, index) => {
    const at = `/templates/${index}`;
    if (templateIds.has(template.id)) {
      issues.push({
        code: 'schema-invalid',
        location: `${at}/id`,
        message: `The template id "${template.id}" is used more than once.`,
      });
    }
    templateIds.add(template.id);
    if (template.id.startsWith(DERIVED_ID_PREFIX)) {
      issues.push({
        code: 'schema-invalid',
        location: `${at}/id`,
        message: `The template id "${template.id}" is in the reserved "u-" space.`,
      });
    }
    const missing = referenceIssue(context, template.documentType, `${at}/documentType`);
    if (missing) issues.push(missing);
    const path = validateDocumentPath(template.filename);
    if (!path.ok) {
      issues.push({
        code: 'schema-invalid',
        location: `${at}/filename`,
        message: `The template filename is not a valid document path (${path.violation}).`,
      });
    }
    const key = foldPathKey(template.filename);
    if (filenames.has(key)) {
      issues.push({
        code: 'schema-invalid',
        location: `${at}/filename`,
        message: `Two templates have the same filename ignoring case ("${template.filename}").`,
      });
    }
    filenames.add(key);
  });

  const overview = archetype.templates.filter((template) => template.id === OVERVIEW_DOCUMENT_ID);
  const only: TemplateDefinition | undefined = overview.length === 1 ? overview[0] : undefined;
  if (
    only?.documentType !== OVERVIEW_DOCUMENT_TYPE ||
    only.filename !== OVERVIEW_DOCUMENT_PATH ||
    only.include !== 'always'
  ) {
    issues.push({
      code: 'overview-template-invalid',
      location: '/templates',
      message: `The archetype must have exactly one "${OVERVIEW_DOCUMENT_ID}" template of type ${OVERVIEW_DOCUMENT_TYPE}, filename ${OVERVIEW_DOCUMENT_PATH} and include always.`,
    });
  }
  if (context.lookup(DOCUMENT_TYPE_KIND, OVERVIEW_DOCUMENT_TYPE).state !== 'valid') {
    const already = issues.some(
      (issue) =>
        (issue.code === 'reference-missing' || issue.code === 'reference-invalid') &&
        issue.message.includes(`"${OVERVIEW_DOCUMENT_TYPE}"`),
    );
    if (!already) {
      issues.push({
        code: 'reference-missing',
        location: '/requirements',
        message: `The "${OVERVIEW_DOCUMENT_TYPE}" document type that every archetype needs is not available.`,
      });
    }
  }
  return issues;
}

/** The kind `specification-archetype`: requirements and templates; template files live under `templates/`. */
export const specificationArchetypeKind = defineDefinitionKind<
  SpecificationArchetypeDefinitionFile,
  ArchetypeDefinition
>({
  kind: SPECIFICATION_ARCHETYPE_KIND,
  auxiliaryDirectories: [ARCHETYPE_TEMPLATES_DIRECTORY],
  dependsOn: [DOCUMENT_TYPE_KIND],
  schemaVersions: [1],
  maxEntities: ARCHETYPES_MAX,
  schema: () => SpecificationArchetypeDefinitionFileSchema,
  textLimitViolations: findArchetypeFileLimitViolations,
  auxiliaryFiles: (file) =>
    file.templates.flatMap((template, index) =>
      'contentFile' in template
        ? [{ location: `/templates/${index}/contentFile`, path: template.contentFile }]
        : [],
    ),
  parse: (file, auxiliary) => ({
    id: file.id,
    version: file.version,
    title: file.title,
    description: file.description,
    useWhen: file.useWhen,
    ...(file.instructions !== undefined ? { instructions: file.instructions } : {}),
    requirements: file.requirements.map((requirement) => ({
      documentType: requirement.documentType,
      minCount: requirement.minCount,
    })),
    templates: file.templates.map((template): TemplateDefinition => {
      const content =
        'content' in template ? template.content : auxiliary.get(template.contentFile);
      if (content === undefined) throw new Error('A template file was not loaded.');
      const common = {
        id: template.id,
        documentType: template.documentType,
        filename: template.filename,
        ...(template.title !== undefined ? { title: template.title } : {}),
        ...(template.instructions !== undefined ? { instructions: template.instructions } : {}),
        content,
      };
      return template.include === 'always'
        ? { ...common, include: 'always' }
        : {
            ...common,
            include: 'optional',
            ...(template.preselected !== undefined ? { preselected: template.preselected } : {}),
          };
    }),
  }),
  check: archetypeIssues,
  references: (archetype) => {
    const types = new Set<string>();
    for (const requirement of archetype.requirements) types.add(requirement.documentType);
    for (const template of archetype.templates) types.add(template.documentType);
    return [...types].sort().map((id) => ({ kind: DOCUMENT_TYPE_KIND, id }));
  },
});
