/**
 * The words of an agent attempt's commit (D15): `spec(<subject>): <step title> (attempt n) by agent
 * in <slug>`, whole (an Engine subject is never cut: a shorter form is taken whole), and the
 * attempt's trailers. Pure.
 */
import { COMMIT_SUBJECT_MAX } from '../../../../version-control/commits/commit-message';
import type { StoredMessage } from '../../../../specs/manual-commit';
import type { AgentAttemptJournal } from '../../journal/model';

const codePoints = (text: string): number => Array.from(text).length;

/** The subject's scope: the Task of a Task attempt, else `specification`. */
function scopeOf(journal: AgentAttemptJournal): string {
  return journal.subject.kind === 'task' ? journal.subject.taskId : 'specification';
}

/** One line: control characters and line breaks become spaces. */
const oneLine = (text: string): string => text.replace(/[\p{Cc}\p{Zl}\p{Zp}\s]+/gu, ' ').trim();

export function attemptCommitMessage(
  journal: AgentAttemptJournal,
  stepTitle: string,
  slug: string,
): StoredMessage {
  const scope = `spec(${scopeOf(journal)}): `;
  const title = oneLine(stepTitle) || journal.step;
  const n = String(journal.attempt);
  const candidates = [
    { subject: `${scope}${title} (attempt ${n}) by agent in ${slug}`, title: true, slug: true },
    { subject: `${scope}${title} (attempt ${n}) by agent`, title: true, slug: false },
    { subject: `${scope}attempt ${n} by agent in ${slug}`, title: false, slug: true },
    { subject: `${scope}attempt ${n} by agent`, title: false, slug: false },
  ];
  const chosen =
    candidates.find((candidate) => codePoints(candidate.subject) <= COMMIT_SUBJECT_MAX) ??
    candidates.at(-1)!;
  const actor = journal.proposal?.actor ?? journal.actor;
  const agent = actor.details.model
    ? `${actor.details.provider} (${actor.details.model})`
    : actor.details.provider;
  const body = [
    ...(chosen.title ? [] : [`Step: ${title}`]),
    `Step ${journal.step}, attempt ${String(journal.attempt)}, by agent ${agent}.`,
    ...(chosen.slug ? [] : [`Specification: ${slug}`]),
  ].join('\n');

  return {
    subject: chosen.subject,
    body,
    trailers: {
      'Nevo-Action': 'attempt-commit',
      'Nevo-Attempt': journal.operationId,
      'Nevo-Step': `${journal.step}#${String(journal.attempt)}`,
      ...(journal.subject.kind === 'task' ? { 'Nevo-Task': journal.subject.taskId } : {}),
    },
  };
}
