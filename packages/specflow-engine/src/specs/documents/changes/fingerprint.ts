import { sha256Hex } from '../../../hash';
import type { DocumentWriteRequest, StructuralTarget } from './plan/request';

/** Bumped when the canonical form changes, so an old fingerprint can never equal a new one. */
const FINGERPRINT_FORMAT = 1;

/**
 * The identity of a client request: a hash over a canonical form of every intent field, `operationId`
 * excluded (it is the key the fingerprint is stored under). Contents enter as their sha256, never
 * as text. A replay with an equal body has an equal fingerprint; any other body is
 * `DOCUMENT_OPERATION_CONFLICT`.
 *
 * Normalisation: a batch save is ordered by document id (the order of a set of distinct documents
 * means nothing); a create keeps its request order (it decides the allocated ids) and lists its
 * folders sorted and unique. A template entry is identified by its `templateId` (the client's
 * body holds no rendering); the rendered content hash the operation pins is in the plan (`templates`),
 * which is stored with the operation, so a replay returns the pinned content whatever the catalogue
 * says now. The catalogue revision is a precondition checked when a NEW operation is admitted and is
 * not part of the identity, as for Create.
 */
export function fingerprintDocumentChange(request: DocumentWriteRequest): string {
  return sha256Hex(JSON.stringify({ format: FINGERPRINT_FORMAT, ...canonicalRequest(request) }));
}

function canonicalRequest(request: DocumentWriteRequest): Record<string, unknown> {
  switch (request.action) {
    case 'save':
      return {
        action: request.action,
        documentId: request.documentId,
        expectedRevision: request.expectedRevision,
        content: sha256Hex(request.content),
      };
    case 'save-all':
      return {
        action: request.action,
        documents: [...request.documents]
          .sort((left, right) => compare(left.documentId, right.documentId))
          .map((entry) => ({
            documentId: entry.documentId,
            expectedRevision: entry.expectedRevision,
            content: sha256Hex(entry.content),
          })),
      };
    case 'create':
      return {
        action: request.action,
        documents: request.documents.map((entry) => ({
          path: entry.path ?? null,
          type: entry.type ?? null,
          templateId: entry.templateId ?? null,
          // A template entry is identified by the template, as the client names it: its rendering
          // is not in the client's body, so a replay could not reproduce it.
          content: entry.templateId === undefined ? sha256Hex(entry.content ?? '') : null,
        })),
        folders: [...new Set(request.folders)].sort(compare),
      };
    case 'folder':
      return { action: request.action, path: request.path };
    case 'rename':
      return {
        action: request.action,
        target: canonicalTarget(request.target),
        name: request.name,
        expectedRevision: request.expectedRevision,
      };
    case 'move':
      return {
        action: request.action,
        target: canonicalTarget(request.target),
        targetFolder: request.targetFolder,
        expectedRevision: request.expectedRevision,
      };
    case 'delete':
      return {
        action: request.action,
        target: canonicalTarget(request.target),
        expectedRevision: request.expectedRevision,
      };
    case 'classify':
      return {
        action: request.action,
        documentId: request.documentId,
        type: request.type,
        expectedRevision: request.expectedRevision,
      };
    default: {
      const exhaustive: never = request;
      return exhaustive;
    }
  }
}

function canonicalTarget(target: StructuralTarget): Record<string, unknown> {
  return target.kind === 'document'
    ? { kind: target.kind, documentId: target.documentId }
    : { kind: target.kind, path: target.path };
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
