/**
 * Puts `text` on the clipboard. Resolves to whether it did: `navigator.clipboard` is missing outside
 * secure contexts and the browser may refuse the write, so a caller says so instead of reporting a
 * copy that did not happen. Never rejects.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) {
      return false;
    }

    await navigator.clipboard.writeText(text);

    return true;
  } catch {
    return false;
  }
}
