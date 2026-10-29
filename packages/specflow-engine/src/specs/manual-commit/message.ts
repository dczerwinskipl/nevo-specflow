/**
 * The words of a manual commit: the default message when the person gave none, and the Engine's own
 * trailers (the last paragraph of the message). Pure. The person's text is validated by
 * `version-control/commits/commit-message`; nothing here reads it as anything but text.
 */
import {
  COMMIT_SUBJECT_MAX,
  parseUserCommitMessage,
  type CommitMessageProblem,
} from '../../version-control/commits/commit-message';
import { cutIdsAtBoundaries } from '../../version-control/commits/document-change';
import { ledgerOwnerOfKey } from '../durable/ledger/model';
import type { ManualCommitScope } from './model';
import type { StoredMessage } from './payload';

/** The message of a request: the person's cleaned text, or the default for the scope. */
export type ResolvedMessage =
  | { readonly ok: true; readonly message: StoredMessage }
  | { readonly ok: false; readonly problem: CommitMessageProblem };

/** `spec(docs): manual commit <slug>` for a Specification, `definitions: manual commit` for the definitions. */
export function defaultManualCommitSubject(input: {
  readonly scope: ManualCommitScope;
  readonly slug: string | undefined;
}): string {
  if (input.scope === 'definitions') return 'definitions: manual commit';
  if (input.scope === 'specification' && input.slug !== undefined) {
    const subject = `spec(docs): manual commit ${input.slug}`;
    return Array.from(subject).slice(0, COMMIT_SUBJECT_MAX).join('');
  }
  return 'manual commit: uncommitted Engine changes';
}

export function resolveMessage(
  text: string | undefined,
  fallback: { readonly scope: ManualCommitScope; readonly slug: string | undefined },
): ResolvedMessage {
  if (text === undefined) {
    return { ok: true, message: { subject: defaultManualCommitSubject(fallback), body: '' } };
  }
  const parsed = parseUserCommitMessage(text);
  return parsed.ok ? { ok: true, message: parsed.message } : { ok: false, problem: parsed.problem };
}

const SPEC_PATH = /^specs\/(?:active|archive)\/[^/]+\/(.+)$/u;

/** The path of a Specification document relative to its directory; any other path as it is. */
export function documentPathOf(path: string): string {
  return SPEC_PATH.exec(path)?.[1] ?? path;
}

/**
 * The Engine's trailers of a manual commit, from the EFFECTIVE set (the port adds `Nevo-Operation`
 * and `Nevo-Kind`): `Nevo-Action: manual-commit`, `Nevo-Scope`, `Nevo-Spec` when Specifications are
 * involved (their ids, cut at id boundaries with a `+N` count) and `Nevo-Documents` (the committed
 * paths of the Specifications, relative to their directories, cut at path boundaries).
 */
export function manualCommitTrailers(input: {
  readonly scope: ManualCommitScope;
  readonly owners: readonly string[];
  readonly effective: readonly string[];
  readonly ownerOfPath: ReadonlyMap<string, string>;
}): Record<string, string> {
  const specIds = input.owners.flatMap((key) => {
    const owner = ledgerOwnerOfKey(key);
    return owner?.kind === 'specification' ? [owner.id] : [];
  });
  const documents = input.effective
    .filter((path) => ledgerOwnerOfKey(input.ownerOfPath.get(path) ?? '')?.kind === 'specification')
    .map(documentPathOf);
  return {
    'Nevo-Action': 'manual-commit',
    'Nevo-Scope': input.scope,
    ...(specIds.length > 0 ? { 'Nevo-Spec': cutIdsAtBoundaries(specIds) } : {}),
    ...(documents.length > 0 ? { 'Nevo-Documents': cutIdsAtBoundaries(documents) } : {}),
  };
}
