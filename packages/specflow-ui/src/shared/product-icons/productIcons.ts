import {
  BookMarked,
  BookOpen,
  Bot,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  Container,
  Diff,
  FileSearch,
  FileText,
  Files,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  GitCompare,
  Glasses,
  History,
  Home,
  Library,
  ListOrdered,
  MessageSquare,
  MessageSquarePlus,
  MessagesSquare,
  Network,
  Package,
  PanelsTopLeft,
  Paperclip,
  Scale,
  ScanEye,
  ScrollText,
  Server,
  Telescope,
  UserCheck,
  UserPen,
  UserX,
  Workflow,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

/*
 * The product icon dictionary (interaction-model.md "Product icons"): one glyph per product
 * concept, used for nothing else. Features name the concept (`productIcons.task.item`), never the
 * glyph: ESLint (`specflow-icons/no-direct-product-icon`) refuses these glyphs from `lucide-react`
 * and their `Icon` registry names anywhere else in production code, so a glyph cannot drift into a
 * second meaning. The glyph names are listed for that rule in `productGlyphs.json`; a test keeps
 * both in step.
 *
 * The four items have a related pair: `item` on item rows, item page headers and the trail's item;
 * `collection` on the navigation and on section and list headers. State icons (done, running,
 * waiting, on hold, attention, failed, cancelled) are a separate set and never replace these.
 */

/** A product item's pair of related glyphs. */
export interface ProductItemIcons {
  /** One item: its rows, its page header and the trail's item. */
  readonly item: LucideIcon;
  /** Many: the navigation and section or list headers. */
  readonly collection: LucideIcon;
}

export const productIcons = {
  specification: { item: BookOpen, collection: Library },
  task: { item: ClipboardCheck, collection: ClipboardList },
  session: { item: MessageSquare, collection: MessagesSquare },
  /** A file of a Specification or Task without a type icon (a typed one shows its type's). */
  document: { item: FileText, collection: Files },
  /** The action that starts a conversation ("New session", "Create with AI"). */
  startConversation: MessageSquarePlus,
  /** The repository's documentation (the reader). */
  documentation: BookMarked,
  /** A step of the workflow (Design, Implement, Review...), and nothing else. */
  workflowStep: Workflow,
  /** An agent before a provider is chosen, and an unknown provider (a known one shows its mark). */
  agent: Bot,
  /** What an agent is given to read (a Task's Context, a Session's Context). */
  context: Paperclip,
  /** A Task this Task waits for. */
  dependency: Network,
  commit: GitCommitHorizontal,
  /** Uncommitted or compared workspace changes. */
  changes: GitCompare,
  branch: GitBranch,
  repository: FolderGit2,
  /** Activity, Work and attempt history (the clock is the Waiting state). */
  history: History,
  /** A Specification's Overview area. */
  overview: Home,
  /** Something an agent did with a tool. */
  toolAction: Wrench,
  /** A file an agent read (a Work row): not a Document, which is a file of a Specification or Task. */
  fileRead: Glasses,
  /** The files an attempt changed in the repository (its changes list), whatever they are. */
  changedFiles: Diff,
  /** A step's result waits for the owner's review (an attention reason; the Eye is a preview). */
  review: ScanEye,
  /** The agent's standing instructions. */
  instructions: ScrollText,
  /** Files an agent produced. */
  artifacts: Package,
  /** Where a Session runs. */
  environment: Container,
  /** The owner confirmed an agent's result ("Confirmed by you"). */
  ownerConfirmed: UserCheck,
  /** The owner rejected an agent's result ("Rejected by you"). */
  ownerRejected: UserX,
} as const satisfies Record<string, LucideIcon | ProductItemIcons>;

/**
 * The glyphs document types may declare (`packages/specflow-engine/definitions/document-type/*.yaml`
 * `icon:`), by the name a definition uses. They belong to the dictionary: a typed document shows its
 * type's glyph in place of the Document glyph, and no other concept uses them.
 */
export const documentTypeIcons = {
  telescope: Telescope,
  boxes: Boxes,
  server: Server,
  'list-ordered': ListOrdered,
  scale: Scale,
  'file-search': FileSearch,
  'user-pen': UserPen,
  'panels-top-left': PanelsTopLeft,
} as const satisfies Record<string, LucideIcon>;

export type DocumentTypeIconName = keyof typeof documentTypeIcons;

/** The glyph a document type declares; `undefined` for a missing or unknown name (never a failure). */
export function documentTypeIcon(name: string | undefined): LucideIcon | undefined {
  return name !== undefined && Object.prototype.hasOwnProperty.call(documentTypeIcons, name)
    ? documentTypeIcons[name as DocumentTypeIconName]
    : undefined;
}
