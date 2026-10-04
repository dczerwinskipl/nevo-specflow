import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaultNevoBrand } from './NevoBrandLogo';
import { NevoMark, nevoMarkFoldShadowOpacity, nevoMarkGeometry } from './NevoMark';
import { deriveNevoMarkPalette } from './palette';

const palette = deriveNevoMarkPalette(defaultNevoBrand);

describe('NevoMark', () => {
  it('uses the canonical square viewport and centered supplied geometry', () => {
    const html = renderToStaticMarkup(<NevoMark />);

    expect(html).toContain('viewBox="0 0 224 224"');
    expect(html).toContain('transform="translate(18 24)"');
    expect(html).toContain(`d="${nevoMarkGeometry.leftBack}"`);
    expect(html).toContain(`d="${nevoMarkGeometry.rightBack}"`);
    expect(html).toContain(`d="${nevoMarkGeometry.ribbon}"`);
  });

  it('creates non-conflicting semantic gradient IDs for multiple instances', () => {
    const html = renderToStaticMarkup(
      <>
        <NevoMark palette={palette} variant="brand" />
        <NevoMark palette={palette} variant="brand" />
      </>,
    );
    const ids = [...html.matchAll(/id="(nevo-logo-[^"]+)"/g)].map((match) => match[1]);

    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(ids.length);
    expect(html).not.toContain('paint0_linear_0_1');
  });

  it('keeps the component decorative by default and supports an explicit accessible name', () => {
    expect(renderToStaticMarkup(<NevoMark />)).toContain('aria-hidden="true"');
    const labelled = renderToStaticMarkup(
      <NevoMark aria-label="Nevo" decorative={false} title="Nevo logo" />,
    );
    const root = labelled.slice(0, labelled.indexOf('>') + 1);

    expect(labelled).toContain('aria-label="Nevo"');
    expect(labelled).toContain('<title>Nevo logo</title>');
    expect(root).not.toContain('aria-hidden="true"');
  });

  it('renders monochrome from currentColor without brand gradient tokens', () => {
    const html = renderToStaticMarkup(<NevoMark variant="monochrome" />);

    expect(html).toContain('fill="currentColor"');
    expect(html).not.toContain('--nevo-mark-');
    expect(html).not.toContain('<linearGradient');
  });

  it('keeps geometry bound to private variables instead of literal fill paints', () => {
    const html = renderToStaticMarkup(<NevoMark palette={palette} variant="brand" />).toLowerCase();

    expect(html).toContain('stop-color="var(--nevo-mark-ribbon-start)"');
    expect(html).toContain('stop-color="var(--nevo-mark-ribbon-mid)"');
    expect(html).toContain('stop-color="var(--nevo-mark-ribbon-end)"');
    expect(html).not.toMatch(/fill="#[\da-f]{6}"/);
  });

  it('softens the supplied fold overlays without changing their geometry', () => {
    const html = renderToStaticMarkup(<NevoMark palette={palette} variant="brand" />);

    expect(nevoMarkFoldShadowOpacity).toEqual({ left: 0.8, right: 0.16 });
    expect(html).toContain('fill-opacity="0.8"');
    expect(html).toContain('fill-opacity="0.16"');
  });
});
