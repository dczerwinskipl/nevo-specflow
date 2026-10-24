import { describe, expect, it } from 'vitest';

import { isProtectedDocument, folderContainsProtectedDocument } from './protection';
import * as limits from './limits';

describe('limits (architecture "Limits")', () => {
  it('holds the documented values in bytes', () => {
    expect(limits.TEXT_CONTENT_MAX_BYTES).toBe(1_048_576);
    expect(limits.RAW_CONTENT_MAX_BYTES).toBe(25 * 1_048_576);
    expect(limits.RAW_CONTENT_MAX_BYTES).toBeLessThan(limits.ARCHIVE_FILE_MAX_BYTES);
    expect(limits.CONTENT_HASH_MAX_BYTES).toBe(1_048_576);
    expect(limits.REVISION_MEMO_MAX_ENTRIES).toBe(5000);
    expect(limits.MANIFEST_MAX_BYTES).toBe(256 * 1024);
    expect(limits.LISTED_FILES_MAX).toBe(2000);
    expect(limits.FOLDER_DEPTH_MAX).toBe(8);
    expect(limits.ARCHIVE_FILES_MAX).toBe(4096);
    expect(limits.ARCHIVE_COUNT_TRAVERSAL_FILES_STOP).toBe(4097);
    expect(limits.ARCHIVE_COUNT_TRAVERSAL_ENTRIES_MAX).toBe(20000);
    expect(limits.ARCHIVE_FILE_MAX_BYTES).toBe(32 * 1_048_576);
    expect(limits.ADDED_DOCUMENTS_MAX_FILES).toBe(10);
    expect(limits.ADDED_DOCUMENTS_MAX_FOLDERS).toBe(100);
    expect(limits.ADDED_DOCUMENTS_MAX_TOTAL_BYTES).toBe(1_048_576);
    expect(limits.TEMPLATE_TEXT_MAX_BYTES).toBe(64 * 1024);
    expect(limits.DOCUMENT_PATH_MAX_CHARACTERS).toBe(500);
    expect(limits.HTTP_BODY_SAVE_AND_CREATE_MAX_BYTES).toBe(2 * 1_048_576);
    expect(limits.HTTP_BODY_DOCUMENT_OPERATION_MAX_BYTES).toBe(256 * 1024);
    expect(limits.CREATE_JOURNAL_MAX_BYTES).toBe(65_536);
    expect(limits.CONTENT_SNIFF_BYTES).toBe(8192);
  });
});

describe('overview protection predicate (PC-1)', () => {
  it('protects the overview by id and by its fixed path', () => {
    expect(isProtectedDocument({ id: 'overview', path: 'overview.md' })).toBe(true);
    expect(isProtectedDocument({ id: 'overview' })).toBe(true);
    expect(isProtectedDocument({ id: 'x', path: 'Overview.MD' })).toBe(true);
  });

  it('protects nothing else', () => {
    expect(isProtectedDocument({ id: 'behaviour', path: 'behaviour.md' })).toBe(false);
    expect(isProtectedDocument({ id: 'u-0123456789abcdef', path: 'sub/overview.md' })).toBe(false);
  });

  it('protects the root folder only', () => {
    expect(folderContainsProtectedDocument('')).toBe(true);
    expect(folderContainsProtectedDocument('research')).toBe(false);
    expect(folderContainsProtectedDocument('overview.md')).toBe(false);
  });
});
