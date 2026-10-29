import type { PolicyReason } from '@nevo/specflow-engine';

/**
 * Seeded document directories of the catalogue Specifications. Together they show every state of
 * the documents layer: registered documents of several types, unclassified files, a dangling entry,
 * an unmet requirement, an image, a binary file, a text file that is not editable, a Specification
 * on a protected branch and an archived one. Clearly demo-only content.
 */
export interface SeedFile {
  readonly path: string;
  /** Registered with this document type; absent: an unclassified file. */
  readonly type?: string;
  readonly text?: string;
  readonly bytes?: Uint8Array;
}

export interface SpecSeed {
  readonly archetypeId: string;
  /** Files besides `overview.md`. */
  readonly files: readonly SeedFile[];
  /** Registry entries whose file is missing. */
  readonly dangling?: readonly { readonly path: string; readonly type: string }[];
  readonly folders?: readonly string[];
  readonly location?: 'archive';
  readonly policyReason?: PolicyReason;
}

/** A 16 x 16 PNG (95 bytes): a framed square. */
export const DEMO_PNG = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAJklEQVR42mP4TyJgoKMG1eTXeBB2Dbdf/cOKRjXQVwNpETdoEh8AeZC3N8TGXKQAAAAASUVORK5CYII=',
    'base64',
  ),
);

/** A small binary file (a PDF header followed by bytes that are not text). */
export const DEMO_BINARY = Uint8Array.from([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a, 0x00,
  0x01, 0x02, 0x03, 0xff, 0xfe, 0x00, 0x10, 0x20, 0x30, 0x40, 0x0a,
]);

const text = (title: string, body: string) => `# ${title}\n\n${body}\n`;

export const specSeeds: Readonly<Record<string, SpecSeed>> = {
  // `admission` is the showcase when enabled (see showcase.ts); otherwise only its overview.
  admission: { archetypeId: 'feature', files: [] },
  // Demo-only owner archetype that requires `decisions`: the requirement is unmet.
  security: {
    archetypeId: 'cross-module',
    files: [
      {
        path: 'architecture.md',
        type: 'architecture',
        text: text('Access policy - Architecture', 'Demonstration architecture analysis.'),
      },
      {
        path: 'notes/open-questions.md',
        text: text('Open questions', 'Demonstration notes that are not classified yet.'),
      },
    ],
  },
  // An image, a binary file and a registry entry whose file is missing.
  review: {
    archetypeId: 'feature',
    files: [
      {
        path: 'behaviour.md',
        type: 'behaviour',
        text: text('Review evidence - Behaviour', 'Demonstration scenarios.'),
      },
      { path: 'evidence/screen.png', bytes: DEMO_PNG },
      { path: 'evidence/report.pdf', bytes: DEMO_BINARY },
    ],
    dangling: [{ path: 'ux.md', type: 'ux' }],
  },
  // The checked-out branch is protected: every write is refused with `branch-protected`.
  packaging: {
    archetypeId: 'minimal',
    policyReason: 'branch-protected',
    files: [
      { path: 'note.md', type: 'note', text: text('Packaging notes', 'Demonstration note.') },
    ],
  },
  // A text file that is readable but not editable (`json`).
  providers: {
    archetypeId: 'minimal',
    files: [{ path: 'traces/replay.json', text: '{\n  "replay": "demo",\n  "steps": 3\n}\n' }],
  },
  localization: { archetypeId: 'minimal', files: [] },
  // Archived: read-only, every write is refused with `archived`.
  'archived-shell': {
    archetypeId: 'feature',
    location: 'archive',
    files: [
      {
        path: 'behaviour.md',
        type: 'behaviour',
        text: text('Application shell - Behaviour', 'Demonstration scenarios.'),
      },
      { path: 'ux.md', type: 'ux', text: text('Application shell - UX', 'Demonstration flows.') },
    ],
  },
};

/** A catalogue Specification without its own seed: an overview only. */
export const defaultSeed: SpecSeed = { archetypeId: 'minimal', files: [] };
