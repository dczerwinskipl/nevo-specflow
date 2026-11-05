import type { CatalogueState } from './TypeDialogFrame';

/** The New document or Assign type dialog that is open; `key` makes each open a fresh dialog. */
export type TypeRequest =
  | { kind: 'new'; folder: string; type?: string; key?: string }
  | { kind: 'classify'; id: string; path: string; expectedRevision: string; key?: string };

let dialogSequence = 0;
export const newTypeRequestKey = () => `type-dialog-${++dialogSequence}`;

/** Without a catalogue the labels show type ids and the chooser offers only "No type". */
export const noCatalogue: CatalogueState = { isPending: false, retry: () => undefined };
