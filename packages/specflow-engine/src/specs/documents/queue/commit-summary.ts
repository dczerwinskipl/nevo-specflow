import type { DocumentChangePlan } from '../changes/plan/model';
import { manifestPathOf } from '../changes/plan/model';

/**
 * The subject and body of a document-change commit: what happened, in words, derived from the plans
 * of the operations the batch commits (ADR 0016: one commit per batch). Pure; no I/O.
 *
 * Subject: `spec(documents): <what> in <slug>`, at most {@link DOCUMENT_COMMIT_SUBJECT_MAX}
 * characters (code points). A long name or slug is shortened with an ellipsis, deterministically and
 * never inside a character. Body: one line per change (bounded), then the number of operations when
 * the batch coalesced several. A member whose plan is unknown contributes its action only; the words
 * then come from the action and the committed paths.
 */

export const DOCUMENT_COMMIT_SUBJECT_PREFIX = 'spec(documents): ';
export const DOCUMENT_COMMIT_SUBJECT_MAX = 72;
/** Change lines the body lists before it summarises the rest as `... and N more`. */
export const DOCUMENT_COMMIT_BODY_LINES_MAX = 20;
/** Characters the listed lines of the body may take together. */
export const DOCUMENT_COMMIT_BODY_CHARS_MAX = 1500;

const ELLIPSIS = '…';

export interface SummarizedMember {
  readonly action: string;
  /** The operation's plan; absent when it could not be read (the summary then falls back). */
  readonly plan?: DocumentChangePlan;
}

export interface DocumentCommitMessage {
  readonly subject: string;
  readonly body: string;
}

type Verb = 'update' | 'add' | 'rename' | 'move' | 'delete' | 'classify';

/** One change of one operation; paths are relative to the Specification directory. */
interface Change {
  readonly verb: Verb;
  readonly folder: boolean;
  /** The document or folder; for a folder rename or move of an empty folder it is unknown (`''`). */
  readonly path: string;
  /** Rename and move: where it went. */
  readonly to?: string;
  /** Classify: the type. */
  readonly type?: string;
  /** Listed in the body but not counted in the subject (the files of a deleted folder). */
  readonly implied?: boolean;
}

const VERB_OF_ACTION: Readonly<Record<string, Verb>> = {
  save: 'update',
  'save-all': 'update',
  create: 'add',
  folder: 'add',
  rename: 'rename',
  move: 'move',
  delete: 'delete',
  classify: 'classify',
};

function changesOf(plan: DocumentChangePlan): Change[] {
  const inside = (path: string): string => path.slice(plan.directory.length + 1);
  const documents = plan.paths.filter((path) => path.role === 'document');
  switch (plan.action) {
    case 'save':
    case 'save-all':
      return documents.map((path) => ({ verb: 'update', folder: false, path: inside(path.path) }));
    case 'create':
    case 'folder': {
      const added: Change[] = documents.map((path) => ({
        verb: 'add',
        folder: false,
        path: inside(path.path),
      }));
      // A folder that holds a created document is implied by it.
      const folders = plan.folders.filter(
        (folder) => !added.some((change) => change.path.startsWith(folder + '/')),
      );
      return [
        ...added,
        ...folders.map((folder) => ({ verb: 'add' as const, folder: true, path: folder })),
      ];
    }
    case 'rename':
    case 'move': {
      const verb = plan.action;
      const moved = documents.flatMap((path) =>
        path.source.kind === 'moved-from'
          ? [{ from: inside(path.source.path), to: inside(path.path) }]
          : [],
      );
      const destination = plan.folders[0];
      if (destination === undefined) {
        return moved.map((pair) => ({ verb, folder: false, path: pair.from, to: pair.to }));
      }
      // A folder operation: every file keeps its path below the folder, so the first one tells the origin.
      const first = moved[0];
      const origin =
        first === undefined
          ? ''
          : first.from.slice(0, first.from.length - (first.to.length - destination.length));
      return [{ verb, folder: true, path: origin, to: destination }];
    }
    case 'delete':
      // A folder delete names the folder, also when it holds no file (only the registry changes).
      return [
        ...(plan.removedFolder !== undefined
          ? [{ verb: 'delete' as const, folder: true, path: plan.removedFolder }]
          : []),
        ...documents
          .filter((path) => path.post === null)
          .map((path) => ({
            verb: 'delete' as const,
            folder: false,
            path: inside(path.path),
            ...(plan.removedFolder !== undefined ? { implied: true } : {}),
          })),
      ];
    case 'classify':
      return plan.documents.map((document) => ({
        verb: 'classify',
        folder: false,
        path: document.path,
        ...(document.type !== undefined ? { type: document.type } : {}),
      }));
    default: {
      const exhaustive: never = plan.action;
      return exhaustive;
    }
  }
}

/** A part of a subject: fixed words, or a name that may be shortened to fit. */
type Part = string | { readonly name: string };

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function nounFor(changes: readonly Change[]): string {
  if (changes.every((change) => change.folder)) return 'folder';
  if (changes.every((change) => !change.folder)) return 'document';
  return 'item';
}

function unique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/** The subject of a batch whose changes all share one verb. */
function singleVerbPhrase(verb: Verb, changes: readonly Change[], slug: Part): Part[] {
  const preposition = verb === 'add' ? 'to' : verb === 'delete' ? 'from' : 'in';
  const tail: Part[] = [` ${preposition} `, slug];
  // A new folder that comes with created documents is not counted beside them.
  const named = changes.filter((change) => change.implied !== true);
  const counted =
    verb === 'add' && named.some((change) => !change.folder)
      ? named.filter((change) => !change.folder)
      : named;
  const count = unique(
    counted.map((change) => `${change.folder ? 'f' : 'd'}:${change.path}:${change.to ?? ''}`),
  ).length;
  if (count === 1) {
    const only = counted[0]!;
    const kind = only.folder ? 'folder ' : '';
    if ((verb === 'rename' || verb === 'move') && only.to !== undefined) {
      return only.path === ''
        ? [`${verb} a folder to `, { name: only.to }, ...tail]
        : [`${verb} ${kind}`, { name: only.path }, ' to ', { name: only.to }, ...tail];
    }
    if (verb === 'classify' && only.type !== undefined) {
      return ['classify ', { name: only.path }, ' as ', { name: only.type }, ...tail];
    }
    return [`${verb} ${kind}`, { name: only.path }, ...tail];
  }
  return [`${verb} ${plural(count, nounFor(counted))}`, ...tail];
}

/** The subject when nothing more than the actions and the committed paths is known. */
function fallbackPhrase(
  actions: readonly string[],
  documentPaths: readonly string[],
  slug: Part,
): Part[] {
  const verbs = unique(actions.map((action) => VERB_OF_ACTION[action] ?? 'change'));
  const verb = verbs.length === 1 ? verbs[0]! : 'change';
  if (documentPaths.length === 1) return [`${verb} `, { name: documentPaths[0]! }, ' in ', slug];
  if (documentPaths.length === 0) return [`${verb} documents in `, slug];
  return [`${verb} ${plural(documentPaths.length, 'document')} in `, slug];
}

const codePoints = (text: string): string[] => Array.from(text);

/**
 * Joins the parts within `max` characters: while too long, the longest name (the first of equals)
 * loses one character and ends with an ellipsis. A name keeps at least one character.
 */
export function fitParts(parts: readonly Part[], max: number): string {
  const chars = parts.map((part) => codePoints(typeof part === 'string' ? part : part.name));
  const full = chars.map((list) => list.length);
  const kept = [...full];
  /** A shortened name shows the kept characters and the ellipsis. */
  const shown = (index: number): number =>
    kept[index] === full[index] ? full[index]! : kept[index]! + 1;
  const total = (): number => chars.reduce((sum, _, index) => sum + shown(index), 0);
  while (total() > max) {
    let longest = -1;
    for (const [index, part] of parts.entries()) {
      if (typeof part === 'string' || shown(index) <= 2) continue;
      if (longest === -1 || shown(index) > shown(longest)) longest = index;
    }
    if (longest === -1) break;
    // The first cut removes two characters for the ellipsis; each later one removes one more.
    kept[longest] = kept[longest] === full[longest] ? full[longest]! - 2 : kept[longest]! - 1;
  }
  return chars
    .map((_, index) =>
      kept[index] === full[index]
        ? chars[index]!.join('')
        : chars[index]!.slice(0, kept[index]).join('') + ELLIPSIS,
    )
    .join('');
}

function lineOf(change: Change): string {
  const kind = change.folder ? 'folder ' : '';
  switch (change.verb) {
    case 'rename':
    case 'move':
      return change.path === ''
        ? `${change.verb} a folder -> ${change.to ?? ''}`
        : `${change.verb} ${kind}${change.path} -> ${change.to ?? ''}`;
    case 'classify':
      return `classify ${change.path}${change.type !== undefined ? ' as ' + change.type : ''}`;
    default:
      return `${change.verb} ${kind}${change.path}`;
  }
}

function boundedLines(lines: readonly string[]): string[] {
  const listed: string[] = [];
  let characters = 0;
  for (const line of lines) {
    const size = codePoints(line).length;
    if (
      listed.length >= DOCUMENT_COMMIT_BODY_LINES_MAX ||
      characters + size > DOCUMENT_COMMIT_BODY_CHARS_MAX
    ) {
      break;
    }
    listed.push(line);
    characters += size;
  }
  const rest = lines.length - listed.length;
  return rest > 0 ? [...listed, `${ELLIPSIS} and ${rest} more`] : listed;
}

/**
 * The message of the commit of a batch of one Specification. `effective` are the checkout-relative
 * paths the commit holds; a change none of whose paths is committed (it was undone within the batch)
 * is left out, unless that would leave nothing to say.
 */
export function documentCommitMessage(
  slug: string,
  members: readonly SummarizedMember[],
  effective: readonly string[],
): DocumentCommitMessage {
  const directory = `specs/active/${slug}`;
  const committed = new Set(effective);
  const manifest = manifestPathOf({ directory });
  const all = members.every((member) => member.plan !== undefined)
    ? members.flatMap((member) => changesOf(member.plan!))
    : [];
  const holds = (change: Change): boolean => {
    if (change.folder && change.verb === 'delete') {
      // A deleted folder is in the commit with its registry entry or with any of its files.
      const prefix = `${directory}/${change.path}/`;
      return committed.has(manifest) || effective.some((path) => path.startsWith(prefix));
    }
    if (change.folder || change.verb === 'classify') return committed.has(manifest);
    return [change.path, change.to].some(
      (path) => path !== undefined && committed.has(`${directory}/${path}`),
    );
  };
  const kept = all.filter(holds);
  const changes = kept.length > 0 ? kept : all;
  const slugPart: Part = { name: slug };

  const verbs = unique(changes.map((change) => change.verb));
  const documentPaths = effective
    .filter((path) => path !== manifest && path.startsWith(directory + '/'))
    .map((path) => path.slice(directory.length + 1));
  let phrase: Part[];
  if (changes.length === 0) {
    phrase = fallbackPhrase(
      members.map((member) => member.action),
      documentPaths,
      slugPart,
    );
  } else if (verbs.length === 1) {
    phrase = singleVerbPhrase(verbs[0]!, changes, slugPart);
  } else {
    phrase =
      documentPaths.length === 0
        ? ['change documents in ', slugPart]
        : [`change ${plural(documentPaths.length, 'document')} in `, slugPart];
  }
  const subject = fitParts(
    [DOCUMENT_COMMIT_SUBJECT_PREFIX, ...phrase],
    DOCUMENT_COMMIT_SUBJECT_MAX,
  );

  const lines = boundedLines(changes.length > 0 ? unique(changes.map(lineOf)) : documentPaths);
  const coalesced =
    members.length > 1 ? [`${members.length} document operations in one commit`] : [];
  const body = [lines.join('\n'), ...coalesced].filter((part) => part.length > 0).join('\n\n');
  return { subject, body };
}
