/**
 * How the reader shows an image of a document: never fetched, whatever its source (a local file,
 * a remote address, `data:`). It becomes inert alt text with an image glyph and, on demand, "Image
 * not shown" and the source.
 */
export interface InertImage {
  /** The alt text, empty when the Markdown has none (the view then names it generically). */
  readonly alt: string;
  /** The source as written; absent when the Markdown renderer emptied an unsafe one. */
  readonly source?: string;
  readonly title?: string;
}

export function inertImage(props: {
  readonly alt?: string;
  readonly src?: string;
  readonly title?: string;
}): InertImage {
  const alt = props.alt?.trim() ?? '';
  const source = props.src?.trim();
  const title = props.title?.trim();

  return {
    alt,
    ...(source ? { source } : {}),
    ...(title ? { title } : {}),
  };
}
