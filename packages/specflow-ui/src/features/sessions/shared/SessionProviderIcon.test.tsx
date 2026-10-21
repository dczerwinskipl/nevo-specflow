import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SessionProviderIcon } from './SessionProviderIcon';

describe('provider identity artwork', () => {
  it('preserves the original Claude color asset through the image render path', () => {
    const html = renderToStaticMarkup(<SessionProviderIcon providerId="claude" />);
    expect(html).toContain('<img');
    // The bundler may inline the small SVG as a data: URL instead of a file path; either way the
    // original fill must survive untouched, with no mask/recolor path applied.
    expect(html).toMatch(/fill=(%27|&#x27;|')%23D97757/);
    expect(html).not.toContain('mask-image');
    expect(html).not.toContain('bg-current');
  });
  it('keeps monochrome Codex in the surrounding theme color', () => {
    const html = renderToStaticMarkup(<SessionProviderIcon providerId="codex" />);
    expect(html).toContain('mask-image');
    expect(html).toContain('bg-current');
    expect(html).not.toContain('<img');
  });
  it('uses a neutral fallback for unknown explicit provider identities', () => {
    const html = renderToStaticMarkup(<SessionProviderIcon providerId="unknown" />);
    expect(html).toContain('<svg');
    expect(html).not.toContain('mask-image');
    expect(html).not.toContain('<img');
  });
});
