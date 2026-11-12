import { Type } from 'typebox';

export const DOCS_UNAVAILABLE_CODE = 'DOCS_UNAVAILABLE';
export const DOCS_UNAVAILABLE_MESSAGE = 'Documentation search is unavailable.';

/** `503` of the docs endpoints: the Runtime serves no project documentation, or it is invalid. */
export const DocsUnavailableErrorSchema = Type.Object(
  { error: Type.String(), code: Type.Literal(DOCS_UNAVAILABLE_CODE) },
  { additionalProperties: false },
);

export const docsUnavailableBody = {
  error: DOCS_UNAVAILABLE_MESSAGE,
  code: DOCS_UNAVAILABLE_CODE,
} as const;
