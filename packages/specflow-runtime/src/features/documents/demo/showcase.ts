import type { SeedFile } from './seed-files';
import {
  showcaseAdrContent,
  showcaseFrontmatterContent,
  showcaseSpecificationContent,
} from './showcase-content';

/**
 * Synthetic, clearly demo-only showcase content. It gives the seeded `admission` Specification a
 * realistic nested document tree so the demo exercises folders, nested folders, long file names,
 * an empty folder, registered documents of several types and one unclassified file.
 */
export const demoShowcaseSpecId = 'admission';

const adr =
  'architektura/decyzje/adr-001-deterministyczna-admisja-zadan-i-granice-wykonania-agentow.md';

/** The overview of the showcase (rich Markdown that stresses the renderer). */
export const showcaseOverview = showcaseSpecificationContent;

export const showcaseFiles: readonly SeedFile[] = [
  {
    path: 'architektura/kontekst-systemu.md',
    type: 'architecture',
    text: '# Kontekst systemu\n\nDemonstracyjny opis kontekstu granicy admisji.',
  },
  { path: adr, type: 'decisions', text: showcaseAdrContent },
  {
    path: 'badania/porownanie-dostawcow.md',
    type: 'research',
    text: '# Porównanie dostawców\n\nDemonstracyjne notatki z badań.',
  },
  // Unclassified: a file in the directory that no registry entry names.
  { path: 'badania/ocena-ryzyka.md', text: showcaseFrontmatterContent },
];

/** `notatki` is intentionally empty. */
export const showcaseFolders: readonly string[] = ['notatki'];
