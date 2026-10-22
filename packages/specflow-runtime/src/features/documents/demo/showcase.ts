import type { DemoDocument } from '../../../demo/state';
import {
  showcaseAdrContent,
  showcaseFrontmatterContent,
  showcaseSpecificationContent,
} from './showcase-content';

/**
 * Synthetic, clearly demo-only showcase content. It gives the seeded `admission`
 * Specification a realistic nested document tree so the demo exercises folders,
 * nested folders, long file names and empty folders.
 */
export const demoShowcaseSpecId = 'admission';

const adr =
  'architektura/decyzje/adr-001-deterministyczna-admisja-zadan-i-granice-wykonania-agentow.md';
const showcaseDocuments: readonly Omit<DemoDocument, 'revision'>[] = [
  {
    id: 'showcase-kontekst-systemu',
    title: 'kontekst-systemu.md',
    filename: 'architektura/kontekst-systemu.md',
    content: '# Kontekst systemu\n\nDemonstracyjny opis kontekstu granicy admisji.',
  },
  {
    id: 'showcase-adr-001',
    title: adr.split('/').at(-1)!,
    filename: adr,
    content: showcaseAdrContent,
  },
  {
    id: 'showcase-porownanie-dostawcow',
    title: 'porownanie-dostawcow.md',
    filename: 'badania/porownanie-dostawcow.md',
    content: '# Porównanie dostawców\n\nDemonstracyjne notatki z badań.',
  },
  {
    id: 'showcase-ocena-ryzyka',
    title: 'ocena-ryzyka.md',
    filename: 'badania/ocena-ryzyka.md',
    content: showcaseFrontmatterContent,
  },
];

/** Rich content for the seeded `admission` specification.md (document id `spec`). */
export function demoShowcaseSeedDocuments(): Map<string, DemoDocument> {
  return new Map([
    [
      JSON.stringify([demoShowcaseSpecId, 'spec']),
      {
        id: 'spec',
        title: 'Specification',
        content: showcaseSpecificationContent,
        revision: 'demo-document-1',
      },
    ],
  ]);
}

export function demoShowcaseCollection() {
  return {
    documents: new Map(
      showcaseDocuments.map((document) => [document.id, { ...document, revision: '1' }]),
    ),
    // `notatki` is intentionally empty.
    folders: ['architektura', 'architektura/decyzje', 'badania', 'notatki'],
  };
}
