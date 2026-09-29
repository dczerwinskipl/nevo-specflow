import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NevoBrandLogo } from './NevoBrandLogo';
import { deriveNevoMarkPalette } from './palette';

describe('NevoBrandLogo', () => {
  it('supports the four predefined identity compositions', () => {
    const mark = renderToStaticMarkup(<NevoBrandLogo type="mark" />);
    const horizontal = renderToStaticMarkup(
      <NevoBrandLogo brand="nevo" product="crm" type="horizontal" />,
    );
    const stacked = renderToStaticMarkup(
      <NevoBrandLogo brand="nevo" product="crm" type="stacked" />,
    );
    const signature = renderToStaticMarkup(
      <NevoBrandLogo
        brand="nevo"
        product="crm"
        slogan="Relationships built together"
        type="signature"
      />,
    );

    expect(mark).toContain('aria-label="nevo"');
    expect(mark).not.toContain('>crm</span>');
    expect(horizontal).toContain('flex-row');
    expect(horizontal).toContain('>crm</span>');
    expect(stacked).toContain('flex-col');
    expect(signature).toContain('Relationships built together');
  });

  it('accepts a multiline slogan as explicit text lines', () => {
    const html = renderToStaticMarkup(
      <NevoBrandLogo
        brand="nevo"
        product="ai"
        slogan={['Intelligence with context', 'Built for teams']}
        type="signature"
      />,
    );

    expect(html).toContain('Intelligence with context\nBuilt for teams');
    expect(html).toContain('whitespace-pre-line');
  });

  it('accepts two identity colors without global logo tokens', () => {
    const brand = renderToStaticMarkup(
      <NevoBrandLogo
        brand="nevo"
        coreColor="#2b6bff"
        product="ai"
        secondaryColor="#a855f7"
        type="horizontal"
      />,
    );
    const monochrome = renderToStaticMarkup(
      <NevoBrandLogo appearance="monochrome" brand="nevo" product="ai" type="horizontal" />,
    );

    expect(brand).toContain('--nevo-mark-ribbon-start');
    expect(brand).not.toContain('--color-logo-');
    expect(monochrome).not.toContain('--nevo-mark-ribbon-start');
    expect(monochrome).toContain('fill="currentColor"');
  });

  it('keeps horizontal compact while signature retains the larger mark', () => {
    const small = renderToStaticMarkup(
      <NevoBrandLogo brand="nevo" product="SpecFlow" size="sm" type="horizontal" />,
    );
    const compact = renderToStaticMarkup(
      <NevoBrandLogo brand="nevo" product="crm" size="lg" type="horizontal" />,
    );
    const signature = renderToStaticMarkup(
      <NevoBrandLogo
        brand="nevo"
        product="crm"
        size="lg"
        slogan="Customer relations"
        type="signature"
      />,
    );

    expect(small).toContain('height:20px;width:20px');
    expect(small).toContain('text-[0.9375rem]');
    expect(small).toContain('font-medium');
    expect(small).toContain('gap-2');
    expect(compact).toContain('height:42px;width:42px');
    expect(signature).not.toContain('height:42px;width:42px');
  });

  it('uses the central ribbon color for the product accent', () => {
    const palette = deriveNevoMarkPalette({ coreColor: '#1687ff', secondaryColor: '#16e0cf' });
    const html = renderToStaticMarkup(
      <NevoBrandLogo
        brand="nevo"
        coreColor="#1687ff"
        product="crm"
        secondaryColor="#16e0cf"
        type="horizontal"
      />,
    );

    expect(html).toContain(`color:${palette.ribbonMid}`);
  });

  it('keeps natural wordmark tracking', () => {
    const html = renderToStaticMarkup(
      <NevoBrandLogo brand="nevo" product="crm" type="horizontal" />,
    );

    expect(html).toContain('tracking-normal');
    expect(html).not.toContain('tracking-[-0.');
  });
});

