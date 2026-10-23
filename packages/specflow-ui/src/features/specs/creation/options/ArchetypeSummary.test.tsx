import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StoryLocalization } from '../../../../i18n/StoryLocalization';
import { ArchetypeSummary as Summary } from './ArchetypeSummary';

const ArchetypeSummary = (props: Parameters<typeof Summary>[0]) => (
  <StoryLocalization locale="pl">
    <Summary {...props} />
  </StoryLocalization>
);
import { catalogue } from './creationCatalogue.stories-support';

describe('catalogue archetype summary', () => {
  it('projects actual purpose, ordered phases and counts without a file dump', () => {
    const html = renderToStaticMarkup(<ArchetypeSummary archetype={catalogue.archetypes[0]} />);
    expect(html).toContain(catalogue.archetypes[0]!.description);
    expect(html.indexOf('Doprecyzowanie')).toBeLessThan(html.indexOf('Opracowanie'));
    expect(html).toContain('1 dokument wymagany');
    expect(html).toContain('2 sugerowane później');
    // The disclosure panel stays hidden until it is expanded.
    expect(html).toMatch(/aria-hidden="true" hidden=""/);
    expect(html).toContain('aria-expanded="false"');
  });
  it('uses known document templates independently when workflow metadata is absent', () => {
    const html = renderToStaticMarkup(
      <ArchetypeSummary
        archetype={{ ...catalogue.archetypes[0]!, description: '', workflow: undefined }}
      />,
    );
    expect(html).toContain('Opis workflow niedostępny.');
    expect(html).toContain('Przebieg nie jest opisany w katalogu.');
    expect(html).toContain('1 dokument wymagany');
  });
  it('keeps an authoritative empty archetype distinct from an unavailable selection', () => {
    const html = renderToStaticMarkup(<ArchetypeSummary archetype={catalogue.archetypes[1]} />);
    expect(html).toContain('Brak wymaganych dokumentów');
    expect(html).not.toContain('Szczegóły dokumentów');
    expect(renderToStaticMarkup(<ArchetypeSummary />)).toContain(
      'Wybrany workflow jest niedostępny',
    );
  });
});
