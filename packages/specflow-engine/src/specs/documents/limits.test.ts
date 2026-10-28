import {
  AlwaysTemplateDefinitionSchema,
  DEFINITION_TEMPLATE_MAX_BYTES,
} from '@nevo/specflow-contracts/documents';
import { describe, expect, it } from 'vitest';

import { isProtectedDocument, folderContainsProtectedDocument } from '../document-rules/protection';
import * as archive from '../lifecycle/limits';
import * as createLimits from '../create/limits';
import * as limits from './limits';

describe('limits (architecture "Limits")', () => {
  it('keeps the raw read limit below the Close per-file archive limit', () => {
    expect(limits.RAW_CONTENT_MAX_BYTES).toBeLessThan(archive.ARCHIVE_FILE_MAX_BYTES);
  });

  it('keeps the archive count traversal one file past the archive file limit', () => {
    expect(archive.ARCHIVE_COUNT_TRAVERSAL_FILES_STOP).toBe(archive.ARCHIVE_FILES_MAX + 1);
  });

  it('keeps the journal growth headroom inside the journal cap', () => {
    expect(createLimits.CREATE_JOURNAL_GROWTH_HEADROOM_BYTES).toBeLessThan(
      createLimits.CREATE_JOURNAL_MAX_BYTES,
    );
  });
});

describe('overview protection predicate', () => {
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

describe('limits duplicated by the contracts', () => {
  it('uses the contract template limit and agrees with the contract path length', () => {
    expect(limits.TEMPLATE_TEXT_MAX_BYTES).toBe(DEFINITION_TEMPLATE_MAX_BYTES);
    expect(
      (AlwaysTemplateDefinitionSchema.properties.filename as { maxLength?: number }).maxLength,
    ).toBe(limits.DOCUMENT_PATH_MAX_CHARACTERS);
  });
});
