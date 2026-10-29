import { collect } from './framing.test-support';
import { describe, expect, it } from 'vitest';
import { readProviderLines } from './framing';
function* chunks(values: Uint8Array[]) {
  yield* values;
}

describe('bounded provider protocol framing', () => {
  it('preserves UTF-8 across chunks, CRLF and the final unterminated frame', async () => {
    const bytes = Buffer.from('💬\r\nsecond\nlast');
    expect(
      await collect(
        readProviderLines(chunks([bytes.subarray(0, 2), bytes.subarray(2, 7), bytes.subarray(7)])),
      ),
    ).toEqual(['💬', 'second', 'last']);
  });
  it('rejects a newline-free oversized frame and malformed encoding', async () => {
    await expect(collect(readProviderLines(chunks([Buffer.alloc(17)]), 16))).rejects.toThrow(
      'byte budget',
    );
    await expect(collect(readProviderLines(chunks([Buffer.from([0xff, 10])])))).rejects.toThrow(
      'UTF-8',
    );
  });
  it('pulls the next source chunk only when its consumer advances', async () => {
    let reads = 0;
    function* source() {
      reads++;
      yield Buffer.from('first\n');
      reads++;
      yield Buffer.from('second\n');
    }

    const reader = readProviderLines(source());
    expect((await reader.next()).value).toBe('first');
    expect(reads).toBe(1);
    expect((await reader.next()).value).toBe('second');
    expect(reads).toBe(2);
    await reader.return(undefined);
  });
});
