/** Pull-based UTF-8 line framing. No async event queue and no transcript-sized residual string. */
export async function* readProviderLines(
  source: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
  maxFrameBytes = 1024 * 1024,
): AsyncGenerator<string> {
  if (!Number.isSafeInteger(maxFrameBytes) || maxFrameBytes < 1 || maxFrameBytes > 8 * 1024 * 1024)
    throw new Error('Invalid provider frame limit.');
  let pieces: Buffer[] = [],
    size = 0;
  function append(piece: Uint8Array) {
    size += piece.length;
    if (size > maxFrameBytes) throw new Error('Provider protocol frame exceeds its byte budget.');
    if (piece.length) pieces.push(Buffer.from(piece));
    if (pieces.length >= 1024) pieces = [Buffer.concat(pieces)];
  }
  function take() {
    let bytes = Buffer.concat(pieces, size);
    pieces = [];
    size = 0;
    if (bytes.at(-1) === 13) bytes = bytes.subarray(0, -1);
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new Error('Provider protocol frame contains invalid UTF-8.');
    }
  }
  for await (const chunk of source) {
    const bytes = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    let start = 0;
    for (;;) {
      const end = bytes.indexOf(10, start);
      if (end === -1) {
        append(bytes.subarray(start));
        break;
      }
      append(bytes.subarray(start, end));
      yield take();
      start = end + 1;
    }
  }
  if (size) yield take();
}
