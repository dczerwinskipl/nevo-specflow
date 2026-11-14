import { describe, expect, it } from 'vitest';
import { distinguishingTail, fitMiddle, nameTruncation } from './nameTruncation';

/** A monospaced stand-in: every character is 10 px wide. */
const measure = (text: string) => text.length * 10;

describe('context switcher name truncation', () => {
  it('cuts identifier-like names in the middle and prose at the end', () => {
    expect(nameTruncation('feature-docs-reader')).toBe('middle');
    expect(nameTruncation('nevo_specflow/docs.v2')).toBe('middle');
    expect(nameTruncation('Workspace-aware documentation reader')).toBe('end');
  });

  it('keeps the last segment after a separator, with its separator', () => {
    const base = 'feature-workspace-aware-documentation-reader-search-results-refinement-review';
    expect(distinguishingTail(`${base}-mobile`)).toBe('-mobile');
    expect(distinguishingTail(`${base}-desktop`)).toBe('-desktop');
    expect(distinguishingTail('spike_provider.limits')).toBe('.limits');
    expect(distinguishingTail('features/sessions/managed')).toBe('/managed');
  });

  it('keeps the segment before a last segment shorter than 6 characters', () => {
    expect(distinguishingTail('test-dogfooding-reader-docs')).toBe('-reader-docs');
    expect(distinguishingTail('test-dogfooding-reader-docs-v2')).toBe('-docs-v2');
  });

  it('keeps at most 16 characters', () => {
    // The last two segments would be 19 characters: the short last segment alone.
    expect(distinguishingTail('release-candidate-documentation-docs')).toBe('-docs');
    // A last segment longer than 16 characters keeps its end.
    expect(distinguishingTail('ui-1234-singlesignonwithcorporate')).toBe('nonwithcorporate');
    // No separator: the name is one segment.
    expect(distinguishingTail('averyveryverylongworkspacename')).toBe('ongworkspacename');
  });

  it('shows a name that fits whole', () => {
    expect(fitMiddle('docs-reader', 110, measure)).toBe('docs-reader');
  });

  it('fits the longest head before the kept end, in one string', () => {
    const name = 'feature-workspace-aware-documentation-review-mobile';
    const fitted = fitMiddle(name, 200, measure);
    expect(fitted).toBe('feature-work…-mobile');
    expect(measure(fitted)).toBeLessThanOrEqual(200);
    // One more head character would not fit.
    expect(measure('feature-works…-mobile')).toBeGreaterThan(200);
  });

  it('keeps worktrees that differ only at the end apart', () => {
    const base = 'feature-workspace-aware-documentation-review';
    expect(fitMiddle(`${base}-mobile`, 200, measure)).not.toBe(
      fitMiddle(`${base}-desktop`, 200, measure),
    );
    expect(fitMiddle('test-dogfooding-reader-docs', 160, measure)).toBe('tes…-reader-docs');
    expect(fitMiddle('test-dogfooding-reader-docs-v2', 160, measure)).toBe('test-do…-docs-v2');
  });

  it('cuts a name without a separator in the middle too', () => {
    expect(fitMiddle('averyveryverylongworkspacename', 200, measure)).toBe('ave…ongworkspacename');
  });

  it('shortens the kept end from its start when nothing else fits', () => {
    expect(fitMiddle('feature-review-desktop', 60, measure)).toBe('…sktop');
    expect(fitMiddle('feature-review-desktop', 5, measure)).toBe('…');
  });
});
