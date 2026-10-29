import {
  DocumentTypeDefinitionFileSchema,
  findDocumentTypeFileLimitViolations,
  type DocumentTypeDefinition,
  type DocumentTypeDefinitionFile,
} from '@nevo/specflow-contracts/documents';

import { DERIVED_ID_PREFIX, validateDocumentPath } from '../../document-rules';
import { DOCUMENT_TYPES_MAX } from '../limits';
import { defineDefinitionKind, type DefinitionIssue } from '../kind-registry';

export const DOCUMENT_TYPE_KIND = 'document-type';

/** The kind `document-type`: one file is one document type. */
export const documentTypeKind = defineDefinitionKind<
  DocumentTypeDefinitionFile,
  DocumentTypeDefinition
>({
  kind: DOCUMENT_TYPE_KIND,
  auxiliaryDirectories: [],
  dependsOn: [],
  schemaVersions: [1],
  maxEntities: DOCUMENT_TYPES_MAX,
  schema: () => DocumentTypeDefinitionFileSchema,
  textLimitViolations: findDocumentTypeFileLimitViolations,
  auxiliaryFiles: () => [],
  parse: (file) => ({
    id: file.id,
    title: file.title,
    description: file.description,
    useWhen: file.useWhen,
    instructions: file.instructions,
    ...(file.defaultFilename !== undefined ? { defaultFilename: file.defaultFilename } : {}),
    ...(file.icon !== undefined ? { icon: file.icon } : {}),
  }),
  check: (type) => {
    const issues: DefinitionIssue[] = [];
    if (type.id === 'u' || type.id.startsWith(DERIVED_ID_PREFIX)) {
      issues.push({
        code: 'schema-invalid',
        location: '/id',
        message: `The document type id "${type.id}" is in the reserved "u-" space.`,
      });
    }
    if (type.defaultFilename !== undefined && !validateDocumentPath(type.defaultFilename).ok) {
      issues.push({
        code: 'schema-invalid',
        location: '/defaultFilename',
        message: 'The default filename is not a valid document path.',
      });
    }
    return issues;
  },
  references: () => [],
});
