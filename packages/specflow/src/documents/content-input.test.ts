import { describe, expect, it } from 'vitest';

import { CONTENT_INPUT_MAX_BYTES, readBoundedUtf8 } from './content-input';

async function* chunks(...parts: Uint8Array[]): AsyncGenerator<Uint8Array> {
  for (const part of parts) {
    yield await Promise.resolve(part);
  }
}

describe('readBoundedUtf8', () => {
  it('joins chunks and decodes a character split across them', async () => {
    const bytes = Buffer.from('café €\n', 'utf8');
    const text = await readBoundedUtf8(
      chunks(bytes.subarray(0, 4), bytes.subarray(4)),
      'Standard input',
    );
    expect(text).toBe('café €\n');
  });

  it('refuses bytes that are not UTF-8 instead of replacing them', async () => {
    await expect(
      readBoundedUtf8(chunks(Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a])), 'Standard input'),
    ).rejects.toMatchObject({ code: 'DOCUMENT_OPERATION_INVALID' });
  });

  it('stops reading at the bound without buffering the rest', async () => {
    let produced = 0;
    async function* endless(): AsyncGenerator<Uint8Array> {
      while (true) {
        produced += 1;
        yield await Promise.resolve(Buffer.alloc(1024 * 1024, 0x61));
      }
    }

    await expect(readBoundedUtf8(endless(), 'Standard input')).rejects.toMatchObject({
      code: 'DOCUMENT_TOO_LARGE',
    });
    expect(produced).toBe(CONTENT_INPUT_MAX_BYTES / (1024 * 1024) + 1);
  });
});
