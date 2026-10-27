import { Type } from 'typebox';

import { CATALOGUE_ID_PATTERN, DOCUMENT_ID_PATTERN } from './vocabulary';

/**
 * Building blocks of the definition schemas. Internal to this package: the documents barrel does not
 * re-export this module, so these generic helpers are not part of the public contract (only the
 * byte limits are, through `definition.ts`).
 */

/** Byte limits of the architecture document "Limits" for definition text. */
export const DEFINITION_SHORT_TEXT_MAX_BYTES = 1000;
export const DEFINITION_INSTRUCTIONS_MAX_BYTES = 16 * 1024;
export const DEFINITION_TEMPLATE_MAX_BYTES = 64 * 1024;

// The limits are in UTF-8 bytes, which JSON Schema cannot express (`maxLength` counts characters).
// The schema therefore enforces `maxLength = limit` as a necessary condition (a string longer than
// the limit in characters is always longer in bytes) and `findDefinitionTextLimitViolations` is the
// exact byte check.
export const byteLimitNote = (bytes: number) =>
  `Limit: ${bytes} UTF-8 bytes. This schema bounds characters only; the exact byte check is applied by the Engine.`;
export const shortText = () =>
  Type.String({
    minLength: 1,
    maxLength: DEFINITION_SHORT_TEXT_MAX_BYTES,
    description: byteLimitNote(DEFINITION_SHORT_TEXT_MAX_BYTES),
  });
export const instructionsText = () =>
  Type.String({
    minLength: 1,
    maxLength: DEFINITION_INSTRUCTIONS_MAX_BYTES,
    description: byteLimitNote(DEFINITION_INSTRUCTIONS_MAX_BYTES),
  });

export const catalogueId = () => Type.String({ pattern: CATALOGUE_ID_PATTERN });
export const templateId = () => Type.String({ pattern: DOCUMENT_ID_PATTERN });

/** UTF-8 byte length of a string (this neutral package has no `TextEncoder` or `Buffer` typings). */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}
