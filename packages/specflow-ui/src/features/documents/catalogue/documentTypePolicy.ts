import type {
  ActionReason,
  ArchetypeCatalogue,
  ArchetypeInfo,
  ArchetypeTemplateInfo,
  ContentKind,
  DocumentIssue,
  DocumentTree,
  DocumentTypeInfo,
  RequirementResult,
} from '@nevo/specflow-contracts/documents';
import { isIconName, type IconName } from '@nevo/ui';
import { message, type Message } from '../../../i18n/message';

/*
 * What the documents feature makes of the archetype catalogue and the tree: type labels, unmet
 * requirements, Close-refusing issues, the New document / Assign type choices and the read-only
 * reason. Pure policy (no React, no i18n singleton); catalogue texts are shown as delivered.
 */

/** The protected document type: never offered for a new document or a classification. */
export const overviewTypeId = 'overview';

/** The type's title from the catalogue; without a catalogue (or an unknown id) the id itself. */
export function typeTitle(catalogue: ArchetypeCatalogue | undefined, typeId: string): string {
  return catalogue?.documentTypes.find((type) => type.id === typeId)?.title ?? typeId;
}

/** What a tree row says besides its name: its type (tooltip, accessible name) or that its file is missing. */
export type TrailingLabel = { kind: 'type'; text: string } | { kind: 'missing' };

/** The glyph slot of a document row: the content format of its file. */
const formatGlyph = {
  text: 'file',
  image: 'image',
  binary: 'file-binary',
} as const satisfies Record<ContentKind, IconName>;

/**
 * The leading glyph of a document row (one slot, never two icons): the icon its type declares, when
 * that names a registry glyph, replaces the content format (text, image, any other file). An
 * unknown or missing name never fails, it falls back to the format; an untyped file keeps it.
 */
export function documentRowGlyph(document: { kind?: ContentKind }, typeIcon?: string): IconName {
  return isIconName(typeIcon) ? typeIcon : formatGlyph[document.kind ?? 'text'];
}

/** The icon a document type declares in the catalogue (`documentTypes[].icon`), if any. */
export function declaredTypeIcon(
  catalogue: ArchetypeCatalogue | undefined,
  typeId: string | undefined,
): string | undefined {
  if (!typeId) return undefined;
  return catalogue?.documentTypes.find((type) => type.id === typeId)?.icon;
}

type TreeDocument = DocumentTree['documents'][number];

/**
 * The type title of every registered document (the row's tooltip, menu and accessible name). An
 * unclassified file has none: its row menu offers `Assign type…` and Expected documents name what
 * is still missing.
 */
export function documentTrailingLabel(
  document: Pick<TreeDocument, 'path' | 'classification' | 'type'>,
  catalogue: ArchetypeCatalogue | undefined,
): TrailingLabel | undefined {
  if (document.classification === 'unclassified') return undefined;
  if (document.type) return { kind: 'type', text: typeTitle(catalogue, document.type) };
  return undefined;
}

/** Issue codes after which Close archive is refused (the other codes are shown in rows). */
export const closeRefusingIssueCodes: readonly DocumentIssue['code'][] = [
  'path-case-collision',
  'archive-limit',
];

export function closeRefusingIssues(tree: Pick<DocumentTree, 'issues'>): DocumentIssue[] {
  return tree.issues.filter((issue) => closeRefusingIssueCodes.includes(issue.code));
}

/** Requirements of the archetype that the registered files do not meet yet, in catalogue order. */
export function unmetRequirements(tree: Pick<DocumentTree, 'completeness'>): RequirementResult[] {
  return tree.completeness.requirements.filter((requirement) => !requirement.satisfied);
}

/** The Specification's archetype in the catalogue (by id; the catalogue may hold a newer version). */
export function archetypeOf(
  catalogue: ArchetypeCatalogue | undefined,
  tree: Pick<DocumentTree, 'archetype'>,
): ArchetypeInfo | undefined {
  return catalogue?.archetypes.find((archetype) => archetype.id === tree.archetype.id);
}

/** The archetype's name: the tree's title, else the catalogue's, else its id. */
export function archetypeTitle(
  tree: Pick<DocumentTree, 'archetype'>,
  catalogue: ArchetypeCatalogue | undefined,
): string {
  return tree.archetype.title ?? archetypeOf(catalogue, tree)?.title ?? tree.archetype.id;
}

/** One type of the chooser with the fact that helps the choice. */
export interface TypeChoice {
  type: DocumentTypeInfo;
  /** The archetype's template for this type, when it has one (sent as `templateId`). */
  template?: ArchetypeTemplateInfo;
  fact?: { kind: 'expected'; count: number; min: number } | { kind: 'present'; count: number };
}

export interface TypeChoices {
  /** Optional templates of the Specification's archetype. */
  suggested: TypeChoice[];
  /** The remaining catalogue types. */
  other: TypeChoice[];
}

/** The type chooser of New document and Assign type, grouped; the overview is never offered. */
export function typeChoices(
  catalogue: ArchetypeCatalogue | undefined,
  tree: Pick<DocumentTree, 'archetype' | 'documents' | 'completeness'>,
): TypeChoices {
  if (!catalogue) return { suggested: [], other: [] };
  const archetype = archetypeOf(catalogue, tree);
  const suggestedIds = [
    ...new Set(
      (archetype?.documents ?? [])
        .filter((template) => template.include === 'optional' && template.type !== overviewTypeId)
        .map((template) => template.type),
    ),
  ];
  const choice = (type: DocumentTypeInfo): TypeChoice => {
    const template = archetype?.documents.find((candidate) => candidate.type === type.id);
    const unmet = tree.completeness.requirements.find(
      (requirement) => requirement.documentType === type.id && !requirement.satisfied,
    );
    const count = tree.documents.filter(
      (document) => document.classification === 'registered' && document.type === type.id,
    ).length;
    return {
      type,
      ...(template ? { template } : {}),
      ...(unmet
        ? { fact: { kind: 'expected' as const, count: unmet.count, min: unmet.minCount } }
        : count > 0
          ? { fact: { kind: 'present' as const, count } }
          : {}),
    };
  };
  const known = (id: string) => catalogue.documentTypes.find((type) => type.id === id);
  return {
    suggested: suggestedIds.flatMap((id) => {
      const type = known(id);
      return type ? [choice(type)] : [];
    }),
    other: catalogue.documentTypes
      .filter((type) => type.id !== overviewTypeId && !suggestedIds.includes(type.id))
      .map(choice),
  };
}

/**
 * The type selected when the chooser opens: the one asked for (Add of an expected type), else the
 * first suggested type not present yet, else the first suggested type, else the first other type.
 */
export function initialTypeChoice(choices: TypeChoices, requested?: string): string | undefined {
  const all = [...choices.suggested, ...choices.other];
  if (requested && all.some((choice) => choice.type.id === requested)) return requested;
  const absent = choices.suggested.find(
    (choice) => choice.fact === undefined || choice.fact.kind === 'expected',
  );
  return absent?.type.id ?? choices.suggested[0]?.type.id ?? choices.other[0]?.type.id;
}

/** The name a document of no type starts with. */
export const untypedFileName = 'untitled.md';

/** The pre-filled file name: the template's, else the type's default, else `<type id>.md`. */
export function defaultFileName(choice: TypeChoice | undefined): string {
  if (!choice) return untypedFileName;
  return choice.template?.filename ?? choice.type.defaultFilename ?? `${choice.type.id}.md`;
}

/** The extension of a file name, lower-case, without the dot (`''` when it has none). */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/**
 * Order in which a read-only reason is chosen when several apply (design 5.1). `busy` is transient
 * and never makes a document read-only.
 */
const readOnlyOrder: readonly ActionReason[] = [
  'archived',
  'git-policy-invalid',
  'branch-protected',
  'branch-not-allowed',
  'commit-blocked',
  'not-editable',
];

const firstReason = (reasons: readonly (ActionReason | undefined)[]) =>
  readOnlyOrder.find((reason) => reasons.includes(reason));

/**
 * The Specification-wide reason it cannot be changed: only when creating files, folders and
 * importing are all unavailable (the tree then repeats it once above the rows).
 */
export function specificationReadOnlyReason(
  tree: Pick<DocumentTree, 'capabilities'>,
): ActionReason | undefined {
  const { createFile, createFolder, import: importFiles } = tree.capabilities;
  if (createFile.available || createFolder.available || importFiles.available) return undefined;
  const reasons = [createFile.reason, createFolder.reason, importFiles.reason];
  return (
    firstReason(reasons) ?? reasons.find((reason) => reason !== undefined && reason !== 'busy')
  );
}

/**
 * Why one document opens read-only: the file is not editable, or a Specification-wide write
 * capability is unavailable (the contract has no per-document write action yet).
 */
export function documentReadOnlyReason(
  tree: Pick<DocumentTree, 'capabilities'> | undefined,
  document: { editable: boolean },
): ActionReason | undefined {
  const capabilities = tree?.capabilities;
  const reasons: (ActionReason | undefined)[] = capabilities
    ? [capabilities.createFile, capabilities.createFolder, capabilities.import]
        .filter((action) => !action.available)
        .map((action) => action.reason)
    : [];
  if (!document.editable) reasons.push('not-editable');
  return firstReason(reasons);
}

/** The fragment naming a reason ("this branch is protected from SpecFlow commits."). */
export function reasonFragment(reason: ActionReason): Message {
  switch (reason) {
    case 'archived':
      return message('documents.reason.archived');
    case 'branch-protected':
      return message('documents.reason.branchProtected');
    case 'branch-not-allowed':
      return message('documents.reason.branchNotAllowed');
    case 'commit-blocked':
      return message('documents.reason.commitBlocked');
    case 'git-policy-invalid':
      return message('documents.reason.gitPolicyInvalid');
    case 'busy':
      return message('documents.reason.busy');
    case 'not-editable':
      return message('documents.reason.notEditable');
    case 'protected':
      return message('documents.reason.protected');
    case 'root':
      return message('documents.reason.root');
    case 'dangling':
      return message('documents.reason.dangling');
  }
}

/** The sentence that tells what to do about a reason, when there is one. */
export function reasonRemedy(reason: ActionReason): Message | undefined {
  switch (reason) {
    case 'branch-protected':
    case 'branch-not-allowed':
      return message('documents.remedy.branch');
    case 'commit-blocked':
      return message('documents.remedy.commitBlocked');
    case 'git-policy-invalid':
      return message('documents.remedy.gitPolicy');
    case 'not-editable':
      return message('documents.remedy.notEditable');
    default:
      return undefined;
  }
}

/** Reasons that are whole sentences on their own (row-menu notes). */
const sentenceReasons: readonly ActionReason[] = ['protected', 'root', 'dangling'];

/** The row-menu note of an unavailable action: a sentence, or `Unavailable: <fragment>`. */
export function menuReasonNote(reason: ActionReason | undefined): Message | undefined {
  if (!reason) return undefined;
  return sentenceReasons.includes(reason)
    ? reasonFragment(reason)
    : message('documents.reason.note', { reason: reasonFragment(reason) });
}

/**
 * Why nothing can be changed, as one line: above the tree (`tree`) or as the first line of a
 * read-only document (`document`).
 */
export function readOnlyLine(reason: ActionReason, where: 'tree' | 'document'): Message {
  return message(
    where === 'tree' ? 'documents.tree.editingUnavailable' : 'documents.readOnly.line',
    {
      reason: reasonFragment(reason),
    },
  );
}

/** How to write a document of its type: the catalogue's text, shown beside or under the document. */
export interface DocumentGuidance {
  /** The type's title. */
  title: string;
  description: string;
  useWhen: string;
  /** The type's instructions, then the archetype template's own, as plain text. */
  instructions: readonly string[];
}

/**
 * The writing guidance of a registered document whose type the catalogue describes; undefined for
 * an unclassified file, an unknown type or while the catalogue is not loaded.
 */
export function documentGuidance(
  catalogue: ArchetypeCatalogue | undefined,
  tree: Pick<DocumentTree, 'archetype'> | undefined,
  document: { classification?: 'registered' | 'unclassified'; type?: string },
): DocumentGuidance | undefined {
  if (document.classification === 'unclassified' || !document.type) return undefined;
  const type = catalogue?.documentTypes.find((candidate) => candidate.id === document.type);
  const own = type?.instructions.trim();
  if (!type || !own) return undefined;
  const template = tree
    ? archetypeOf(catalogue, tree)
        ?.documents.find((candidate) => candidate.type === type.id)
        ?.instructions?.trim()
    : undefined;
  return {
    title: type.title,
    description: type.description,
    useWhen: type.useWhen,
    instructions: template ? [own, template] : [own],
  };
}
