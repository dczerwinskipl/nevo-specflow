import type { DocumentContent } from '@nevo/specflow-contracts/documents';

/** A demonstration document as the `DocumentContent` of the read route. */
export function demoDocumentContent(document: {
  readonly id: string;
  readonly title: string;
  readonly filename?: string;
  readonly content: string;
  readonly revision: string;
}): DocumentContent {
  return {
    id: document.id,
    path: document.filename ?? document.id + '.md',
    title: document.title,
    classification: 'registered',
    kind: 'text',
    mediaType: 'text/markdown; charset=utf-8',
    size: Buffer.byteLength(document.content, 'utf8'),
    revision: document.revision,
    // The demonstration read route never saves; the demo write routes own editing.
    editable: false,
    content: document.content,
  };
}
