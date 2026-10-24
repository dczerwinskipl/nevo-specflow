import { describe, expect, it } from 'vitest';

import {
  EDITABLE_EXTENSIONS,
  IMAGE_MEDIA_TYPES,
  TEXT_EXTENSIONS,
  classifyContent,
  extensionOf,
  isEditableExtension,
  kindForExtension,
} from './content-kinds';
import { CONTENT_SNIFF_BYTES } from './limits';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('content kind table (architecture "Content kinds")', () => {
  it('lists exactly the architecture text extensions', () => {
    expect([...TEXT_EXTENSIONS]).toEqual(
      'md markdown txt json csv tsv yaml yml toml xml html css js mjs ts tsx jsx py rb go rs java sh sql'.split(
        ' ',
      ),
    );
  });

  it('lists exactly the architecture image extensions with the reference media types', () => {
    expect(Object.keys(IMAGE_MEDIA_TYPES)).toEqual('png jpg jpeg gif webp avif svg'.split(' '));
    expect(IMAGE_MEDIA_TYPES).toMatchObject({
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      avif: 'image/avif',
      svg: 'image/svg+xml',
    });
  });

  it('makes only md and txt editable', () => {
    expect([...EDITABLE_EXTENSIONS]).toEqual(['md', 'txt']);
    expect(isEditableExtension('MD')).toBe(true);
    expect(isEditableExtension('.txt')).toBe(true);
    expect(isEditableExtension('json')).toBe(false);
    expect(isEditableExtension('markdown')).toBe(false);
  });

  it('decides the kind by extension first', () => {
    expect(kindForExtension('md')).toBe('text');
    expect(kindForExtension('.PNG')).toBe('image');
    expect(kindForExtension('zip')).toBe('binary');
    expect(kindForExtension('')).toBe('binary');
  });

  it('extracts the extension of the last segment', () => {
    expect(extensionOf('a/b/Notes.MD')).toBe('md');
    expect(extensionOf('archive.tar.gz')).toBe('gz');
    expect(extensionOf('.hidden')).toBe('');
    expect(extensionOf('dir.d/file')).toBe('');
    expect(extensionOf('Makefile')).toBe('');
  });
});

describe('classifyContent', () => {
  it('serves markdown as text/markdown and other text as text/plain', () => {
    expect(classifyContent('md', bytes('# Hi'))).toEqual({
      kind: 'text',
      mediaType: 'text/markdown; charset=utf-8',
    });
    for (const extension of ['html', 'xml', 'json', 'ts']) {
      expect(classifyContent(extension, bytes('<a/>'))).toEqual({
        kind: 'text',
        mediaType: 'text/plain; charset=utf-8',
      });
    }
  });

  it('never inspects images and keeps svg an image', () => {
    expect(classifyContent('png', new Uint8Array([0, 1, 2]))).toEqual({
      kind: 'image',
      mediaType: 'image/png',
    });
    expect(classifyContent('svg', bytes('<svg onload="x()"/>')).kind).toBe('image');
  });

  it('classifies unknown extensions as binary', () => {
    expect(classifyContent('zip', bytes('PK'))).toEqual({
      kind: 'binary',
      mediaType: 'application/octet-stream',
    });
  });

  it('classifies a text extension as binary for NUL in the first 8 KiB', () => {
    expect(classifyContent('md', new Uint8Array([0x61, 0, 0x62])).kind).toBe('binary');
    const late = new Uint8Array(CONTENT_SNIFF_BYTES + 10).fill(0x61);
    late[CONTENT_SNIFF_BYTES + 5] = 0;
    expect(classifyContent('md', late).kind).toBe('text');
    const inside = new Uint8Array(CONTENT_SNIFF_BYTES + 10).fill(0x61);
    inside[CONTENT_SNIFF_BYTES - 1] = 0;
    expect(classifyContent('md', inside).kind).toBe('binary');
  });

  it('classifies a text extension as binary for invalid UTF-8', () => {
    expect(classifyContent('txt', new Uint8Array([0xff, 0xfe, 0x41])).kind).toBe('binary');
    expect(classifyContent('txt', new Uint8Array([0xc3])).kind).toBe('binary');
    expect(classifyContent('txt', bytes('zażółć 日本語')).kind).toBe('text');
  });

  it('tolerates a multi-byte sequence cut by the sniff window', () => {
    const window = new Uint8Array(CONTENT_SNIFF_BYTES).fill(0x61);
    window.set(bytes('ż').subarray(0, 1), CONTENT_SNIFF_BYTES - 1);
    expect(classifyContent('md', window).kind).toBe('text');
  });

  it('treats an empty file with a text extension as text', () => {
    expect(classifyContent('md', new Uint8Array()).kind).toBe('text');
  });
});
