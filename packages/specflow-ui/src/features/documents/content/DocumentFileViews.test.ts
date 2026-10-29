import { describe, expect, it } from 'vitest';
import { formatFileSize } from './DocumentFileViews';

describe('formatFileSize', () => {
  it('uses the byte symbol below a kilobyte and kB / MB with one decimal above', () => {
    expect(formatFileSize(27, 'en')).toBe('27 B');
    expect(formatFileSize(14_200, 'en')).toBe('14.2 kB');
    expect(formatFileSize(9_000_000, 'en')).toBe('9 MB');
  });
});
