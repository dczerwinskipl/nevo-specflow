import type { DocumentChangePlan } from '../changes/plan/model';
import { manifestPathOf } from '../changes/plan/model';

/**
 * The subject and body of a document-change commit: what happened, in words, derived from the plans
 * of the operations the batch commits (ADR 0016: one commit per batch). Pure; no I/O.
 *
 * Subject: `spec(documents): <what> in <slug>`, at most {@link DOCUMENT_COMMIT_SUBJECT_MAX}
 * characters (code points), never cut: when the names do not fit, a shorter form is taken whole (the
 * names by their last segment, then a count such as `update a document`), first with the slug and
 * then without it. Body: one line per change (bounded), then the number of operations when the batch
 * coalesced several, then `Specification: <slug>` when the subject could not name it. A member whose plan is unknown contributes its action only; the words
 * then come from the action and the committed paths.
 */

export const DOCUMENT_COMMIT_SUBJECT_PREFIX = 'spec(documents): ';
/** The prefix of a commit of workflow state only (writes of the Specification execution store). */
export const WORKFLOW_COMMIT_SUBJECT_PREFIX = 'spec(workflow): ';
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
  // Relative to the Specification directory, so a Task document reads `tasks/<id>/<path>`.
  const specificationDirectory = `specs/active/${plan.slug}`;
  const inside = (path: string): string => path.slice(specificationDirectory.length + 1);
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
    case 'workflow':
      // Worded from its summary (`workflowCommitMessage`), never as document changes.
      return [];
    default: {
      const exhaustive: never = plan.action;

      return exhaustive;
    }
  }
}

/**
 * A subject phrase in its forms, most specific first. A subject is never cut: when the specific form
 * does not fit, a shorter form is taken whole ({@link firstFitting}), and the body keeps the details.
 */
interface Phrase {
  /** The names in full (paths relative to the Specification directory). */
  readonly full: string;
  /** The names by their last segment (the same as `full` when that changes nothing). */
  readonly short: string;
  /** No names: what happened and how much (`update a document`). Always short. */
  readonly counted: string;
  /** What joins the slug: ` in `, ` to ` or ` from `. */
  readonly preposition: string;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function nounFor(changes: readonly Change[]): string {
  if (changes.every((change) => change.folder)) {
    return 'folder';
  }

  if (changes.every((change) => !change.folder)) {
    return 'document';
  }

  return 'item';
}

function unique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/** The last segment of a path. */
const baseName = (path: string): string => path.split('/').at(-1) ?? path;

const named = (full: string, short: string, counted: string, preposition = ' in '): Phrase => ({
  full,
  short,
  counted,
  preposition,
});

const unnamed = (words: string, preposition = ' in '): Phrase =>
  named(words, words, words, preposition);

/** The subject of a batch whose changes all share one verb. */
function singleVerbPhrase(verb: Verb, changes: readonly Change[]): Phrase {
  const preposition = verb === 'add' ? ' to ' : verb === 'delete' ? ' from ' : ' in ';
  // A new folder that comes with created documents is not counted beside them.
  const listed = changes.filter((change) => change.implied !== true);
  const counted =
    verb === 'add' && listed.some((change) => !change.folder)
      ? listed.filter((change) => !change.folder)
      : listed;
  const count = unique(
    counted.map((change) => `${change.folder ? 'f' : 'd'}:${change.path}:${change.to ?? ''}`),
  ).length;
  if (count !== 1) {
    return unnamed(`${verb} ${plural(count, nounFor(counted))}`, preposition);
  }

  const only = counted[0]!;
  const kind = only.folder ? 'folder ' : '';
  const one = `${verb} a ${only.folder ? 'folder' : 'document'}`;
  if ((verb === 'rename' || verb === 'move') && only.to !== undefined) {
    return only.path === ''
      ? named(
          `${verb} a folder to ${only.to}`,
          `${verb} a folder to ${baseName(only.to)}`,
          one,
          preposition,
        )
      : named(
          `${verb} ${kind}${only.path} to ${only.to}`,
          `${verb} ${kind}${baseName(only.path)} to ${baseName(only.to)}`,
          one,
          preposition,
        );
  }

  if (verb === 'classify' && only.type !== undefined) {
    return named(
      `classify ${only.path} as ${only.type}`,
      `classify ${baseName(only.path)} as ${only.type}`,
      one,
      preposition,
    );
  }

  return named(
    `${verb} ${kind}${only.path}`,
    `${verb} ${kind}${baseName(only.path)}`,
    one,
    preposition,
  );
}

/** The subject when nothing more than the actions and the committed paths is known. */
function fallbackPhrase(actions: readonly string[], documentPaths: readonly string[]): Phrase {
  const verbs = unique(actions.map((action) => VERB_OF_ACTION[action] ?? 'change'));
  const verb = verbs.length === 1 ? verbs[0]! : 'change';
  if (documentPaths.length === 1) {
    const path = documentPaths[0]!;

    return named(`${verb} ${path}`, `${verb} ${baseName(path)}`, `${verb} a document`);
  }

  if (documentPaths.length === 0) {
    return unnamed(`${verb} documents`);
  }

  return unnamed(`${verb} ${plural(documentPaths.length, 'document')}`);
}

const codePoints = (text: string): string[] => Array.from(text);

/**
 * The first candidate within `max` characters (code points), whole: an Engine commit subject is never
 * cut. The candidates go from the most specific to the most general, and the last one is a fixed
 * phrase short enough for any bound in use; it is returned even when it is longer.
 */
export function firstFitting(
  candidates: readonly string[],
  max: number = DOCUMENT_COMMIT_SUBJECT_MAX,
): string {
  return (
    candidates.find((candidate) => codePoints(candidate).length <= max) ?? candidates.at(-1) ?? ''
  );
}

interface FittedSubject {
  readonly subject: string;
  /** The subject names the Specification (`... in <slug>`); otherwise the body does. */
  readonly withSlug: boolean;
}

/** `prefix` and the most specific form of the phrase that fits, with the slug when it fits too. */
function fitPhrase(prefix: string, phrase: Phrase, slug: string): FittedSubject {
  const forms = unique([phrase.full, phrase.short, phrase.counted]);
  const candidates = forms.flatMap((form) => [
    { subject: prefix + form + phrase.preposition + slug, withSlug: true },
    { subject: prefix + form, withSlug: false },
  ]);
  const subject = firstFitting(candidates.map((candidate) => candidate.subject));

  return candidates.find((candidate) => candidate.subject === subject)!;
}

/** The body paragraph that names the Specification when the subject could not. */
const specificationLine = (fitted: FittedSubject, slug: string): string[] =>
  fitted.withSlug ? [] : [`Specification: ${slug}`];

/**
 * The subject and body of a commit of workflow state: `spec(workflow): <phrase> in <slug>` when it
 * fits, else the phrase alone, else `change the workflow state` (with the slug when it fits); never
 * cut. The body holds `details`, the phrase when the subject left it out, and the slug when the
 * subject could not name it.
 */
export function workflowCommitMessage(
  phrase: string,
  slug: string,
  details: readonly string[] = [],
): DocumentCommitMessage {
  const fitted = fitPhrase(
    WORKFLOW_COMMIT_SUBJECT_PREFIX,
    named(phrase, phrase, 'change the workflow state'),
    slug,
  );
  const omitted = fitted.subject.startsWith(WORKFLOW_COMMIT_SUBJECT_PREFIX + phrase)
    ? []
    : [phrase];
  const body = [...omitted, ...details, ...specificationLine(fitted, slug)].join('\n');

  return { subject: fitted.subject, body };
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
  const workflow = members.filter((member) => member.action === 'workflow');
  if (workflow.length === 0) {
    return documentsMessage(slug, members, effective);
  }

  // A workflow change speaks for itself: its summary (`create task api`), in the order of the batch.
  const summaries = workflow.map((member) => member.plan?.summary ?? 'change the workflow state');
  const coalesced = members.length > 1 ? [`${members.length} operations in one commit`] : [];
  if (workflow.length === members.length) {
    if (summaries.length === 1) {
      const message = workflowCommitMessage(summaries[0]!, slug);

      return {
        subject: message.subject,
        body: [message.body, ...coalesced].filter((part) => part.length > 0).join('\n\n'),
      };
    }

    const fitted = fitPhrase(
      WORKFLOW_COMMIT_SUBJECT_PREFIX,
      unnamed(plural(summaries.length, 'workflow change')),
      slug,
    );
    const body = [
      boundedLines(summaries).join('\n'),
      ...coalesced,
      ...specificationLine(fitted, slug),
    ].join('\n\n');

    return { subject: fitted.subject, body };
  }

  // Documents and workflow state in one batch (a Task document and its task.yaml, for example).
  const documents = documentsMessage(
    slug,
    members.filter((member) => member.action !== 'workflow'),
    effective,
  );
  const fitted = fitPhrase(
    DOCUMENT_COMMIT_SUBJECT_PREFIX,
    unnamed('change documents and workflow state'),
    slug,
  );
  const listed = documents.body.split('\n\n')[0] ?? '';
  const lines = boundedLines([...(listed.length > 0 ? listed.split('\n') : []), ...summaries]);
  const body = [lines.join('\n'), ...coalesced, ...specificationLine(fitted, slug)]
    .filter((part) => part.length > 0)
    .join('\n\n');

  return { subject: fitted.subject, body };
}

/** The message of a batch of document changes only. */
function documentsMessage(
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

    if (change.folder || change.verb === 'classify') {
      return committed.has(manifest);
    }

    return [change.path, change.to].some(
      (path) => path !== undefined && committed.has(`${directory}/${path}`),
    );
  };

  const kept = all.filter(holds);
  const changes = kept.length > 0 ? kept : all;

  const verbs = unique(changes.map((change) => change.verb));
  const documentPaths = effective
    .filter((path) => path !== manifest && path.startsWith(directory + '/'))
    .map((path) => path.slice(directory.length + 1));
  let phrase: Phrase;
  if (changes.length === 0) {
    phrase = fallbackPhrase(
      members.map((member) => member.action),
      documentPaths,
    );
  } else if (verbs.length === 1) {
    phrase = singleVerbPhrase(verbs[0]!, changes);
  } else {
    phrase =
      documentPaths.length === 0
        ? unnamed('change documents')
        : unnamed(`change ${plural(documentPaths.length, 'document')}`);
  }

  const fitted = fitPhrase(DOCUMENT_COMMIT_SUBJECT_PREFIX, phrase, slug);

  const lines = boundedLines(changes.length > 0 ? unique(changes.map(lineOf)) : documentPaths);
  const coalesced =
    members.length > 1 ? [`${members.length} document operations in one commit`] : [];
  const body = [lines.join('\n'), ...coalesced, ...specificationLine(fitted, slug)]
    .filter((part) => part.length > 0)
    .join('\n\n');

  return { subject: fitted.subject, body };
}
