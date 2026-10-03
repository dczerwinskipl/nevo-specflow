// Use case: create the Git tag + GitHub Release for the current release branch,
// then (for a stable release) ensure the branch advances to the next patch.
//
// ONE operation with an explicit mutation boundary:
//
//   inspect remote/GitHub state
//     -> validate the complete operation
//     -> produce the plan + the events describing every step
//     -> if mutate: perform the mutations
//
// `mutate: false` (validate-only) performs every read-only check the execute
// path performs — it answers "would this succeed right now?" — and makes NO
// commit / branch / tag / Release / PR / auto-merge.
//
// Two INDEPENDENT idempotent phases:
//   A. ensure the tag + its GitHub Release exist
//   B. ensure a stable line has advanced to its next stabilization state
// Completing A must never skip B.

import {
  decideReleaseAction,
  evaluateRequiredChecks,
  highestPrereleaseTagFor,
  latestCheckRunsByName,
  pickReleaseCandidate,
  planRelease,
  REQUIRED_HEAD_CHECKS,
  type ExistingTag,
  type ReleasePlan,
} from '../domain/release-plan.js';
import { lineOfBranch, parseVersionFile, type VersionFile } from '../domain/version.js';
import { InconsistentStateError, UsageError, errorMessage } from '../errors.js';
import type { GitClient, GitHubClient } from '../ports.js';
import { info, type ActionEvent } from './events.js';
import { ensureVersionFileChangePr } from './version-pr.js';

type ValidReleasePlan = Extract<ReleasePlan, { ok: true }>;

export interface CreateReleaseDeps {
  readonly git: GitClient;
  readonly github: GitHubClient;
  readonly hasToken: boolean;
}

export interface CreateReleaseResult {
  readonly events: ActionEvent[];
  readonly plan: ValidReleasePlan;
  /** Actual tag acted on, including recovery of an incomplete prior prerelease. */
  readonly tag: string;
  readonly mutated: boolean;
}

export async function executeRelease(
  input: { channel: string; expectedTag?: string },
  deps: CreateReleaseDeps,
  { mutate, deferAdvance = false }: { mutate: boolean; deferAdvance?: boolean },
): Promise<CreateReleaseResult> {
  const { git, github } = deps;
  const events: ActionEvent[] = [];

  await git.fetch();
  const branch = await git.currentBranch();
  const headSha = await git.headSha();
  const headShort = headSha.slice(0, 7);

  if (lineOfBranch(branch) === null) {
    throw new UsageError(`Releases must be cut from a release/vX.Y branch, not '${branch}'.`);
  }

  // §2 — the release must represent the CURRENT remote protected-branch commit;
  // do this first so everything below reads verified remote state.
  await assertLocalHeadIsRemoteHead(git, branch, headSha);

  // Read version.json from origin/<branch>, not the (possibly dirty) working tree.
  const versionRaw = await git.showFileAtRef(`origin/${branch}`, 'version.json');
  if (versionRaw === null) {
    throw new InconsistentStateError(`origin/${branch} has no version.json — cannot release.`);
  }
  let versionFile: VersionFile;
  try {
    versionFile = parseVersionFile(versionRaw, `origin/${branch}:version.json`);
  } catch (err) {
    throw new InconsistentStateError(
      `origin/${branch} has an invalid version.json: ${errorMessage(err)}`,
      { cause: err },
    );
  }

  const plan = planRelease({
    branch,
    channel: input.channel,
    versionFile,
    existingTags: await git.listTags(),
  });
  if (!plan.ok) {
    throw new UsageError(`Cannot release:\n  - ${plan.errors.join('\n  - ')}`);
  }

  events.push(info('Plan'));
  events.push(info(`  branch  : ${branch}`));
  events.push(info(`  channel : ${plan.channel}`));
  events.push(info(`  tag     : ${plan.tag}${plan.prerelease ? '  (prerelease)' : ''}`));
  if (plan.nextBranchState) {
    events.push(
      info(
        `  then    : advance ${branch} -> { channel: "${plan.nextBranchState.channel}", ` +
          `version: "${plan.nextBranchState.version}" }`,
      ),
    );
  }
  events.push(info(mutate ? '' : '(validate-only — running every check, changing nothing)'));

  // The branch HEAD must have passed CI.
  await ensureHeadChecksPassed(github, headSha);

  // ── Phase A: ensure tag + GitHub Release ────────────────────────────────
  let highestTag: string | null = null;
  let highestTagState: ExistingTag | null = null;
  let recoveringPublishedArtifacts = false;
  if (plan.prerelease) {
    highestTag = highestPrereleaseTagFor(plan.version, plan.channel, await git.listTags());
    if (highestTag) {
      highestTagState = await inspectTag(deps, highestTag, headSha);
      if (highestTagState.state === 'ok' && highestTagState.release) {
        const complete = await hasRequiredReleaseArtifacts(github, highestTag);
        if (!complete) {
          // Candidate selection historically treated tag + Release as complete. Now
          // release assets are part of the durable publication contract, so keep the
          // same prerelease number until its tarball + checksum are present.
          highestTagState = { ...highestTagState, release: false };
          recoveringPublishedArtifacts = true;
        }
      }
    }
  }

  const { tag, recovering } = pickReleaseCandidate({
    plannedTag: plan.tag,
    prerelease: plan.prerelease,
    highestTag,
    highestTagState,
  });
  if (input.expectedTag && tag !== input.expectedTag) {
    throw new InconsistentStateError(
      `Release candidate changed: expected ${input.expectedTag}, resolved ${tag}. ` +
        'Re-run the candidate build/smoke before executing; no release mutation was performed.',
    );
  }

  if (recovering && tag !== plan.tag) {
    events.push(
      info(
        recoveringPublishedArtifacts
          ? `Recovering ${tag}: required product assets are incomplete. ` +
              `Not cutting ${plan.tag}.`
          : `Recovering ${tag}: its tag is on ${headShort} but the GitHub Release is missing. ` +
              `Not cutting ${plan.tag}.`,
      ),
    );
  }

  const existing = await inspectTag(deps, tag, headSha);
  const decision = decideReleaseAction(existing, { tag, headShort, branch });
  if ('error' in decision) throw new InconsistentStateError(decision.error);
  events.push(info(decision.message));

  if (decision.action === 'tag-and-release') {
    if (mutate) {
      await git.createAnnotatedTag({ tag, sha: headSha, message: tag });
      await git.pushTag(tag);
    } else {
      events.push(info(`Would create annotated tag ${tag} at ${headShort} and push it.`));
    }
  }
  if (decision.action !== 'noop') {
    if (mutate) {
      const { url } = await github.createRelease({ tag, prerelease: plan.prerelease });
      events.push(info(`Published GitHub Release: ${url}`));
      events.push(info('(No npm package is published — out of scope.)'));
    } else {
      events.push(
        info(
          `Would create GitHub Release ${tag} (${plan.prerelease ? 'prerelease' : 'stable'}).`,
        ),
      );
    }
  }

  // ── Phase B: for a stable release, ensure the branch advances ───────────
  // Reached even when Phase A was a no-op.
  if (plan.nextBranchState && deferAdvance) {
    events.push(
      info('Stable branch advance deferred until release artifact publication completes.'),
    );
  } else if (plan.nextBranchState) {
    const nextState = plan.nextBranchState;
    await ensureVersionFileChangePr(
      { git, github, hasToken: deps.hasToken },
      {
        baseBranch: branch,
        headBranch: `chore/advance-${branch.replace(/\//g, '-')}-to-${nextState.version}`,
        currentBaseVersion: versionFile,
        nextState,
        commitMessage: `chore(release): open ${nextState.version} stabilization (beta)`,
        prTitle: `chore(release): open ${nextState.version} stabilization (beta)`,
        prBody:
          `The previous patch on \`${branch}\` shipped. Move the branch to ` +
          `\`{ channel: "${nextState.channel}", version: "${nextState.version}" }\` so its builds ` +
          `report \`${nextState.version}-beta.<n>\` instead of the already-released version.`,
        verb: 'advanced',
      },
      { mutate, events },
    );
  }

  return { events, plan, tag, mutated: mutate };
}


async function hasRequiredReleaseArtifacts(github: GitHubClient, tag: string): Promise<boolean> {
  let names: string[];
  try {
    names = await github.releaseAssetNames(tag);
  } catch (err) {
    throw new InconsistentStateError(
      `Could not determine GitHub Release assets for ${tag}: ${errorMessage(err)}. ` +
        'Refusing to advance the prerelease sequence without proving publication is complete.',
      { cause: err },
    );
  }

  const version = tag.replace(/^v/, '');
  const tarball = `nevo-specflow-${version}.tgz`;
  const required = [tarball, `${tarball}.sha256`];
  return required.every((name) => names.includes(name));
}

/** §2 — refuse a stale / diverged local checkout. */
async function assertLocalHeadIsRemoteHead(
  git: GitClient,
  branch: string,
  headSha: string,
): Promise<void> {
  const remote = await git.resolveCommit(`origin/${branch}`);
  if (remote === null) {
    throw new InconsistentStateError(
      `Cannot resolve origin/${branch} after fetch — refusing to release from a branch whose ` +
        `remote state is unknown.`,
    );
  }
  if (remote !== headSha) {
    throw new InconsistentStateError(
      `${branch} local HEAD ${headSha.slice(0, 7)} is not origin/${branch} ${remote.slice(0, 7)} ` +
        `(behind or diverged). A release must tag the current remote protected-branch commit — ` +
        `update the checkout (\`git pull --ff-only\`) and retry.`,
    );
  }
}

async function ensureHeadChecksPassed(github: GitHubClient, sha: string): Promise<void> {
  const byName = latestCheckRunsByName(await github.checkRunsForCommit(sha));
  const { missing, notPassing } = evaluateRequiredChecks(byName, REQUIRED_HEAD_CHECKS);
  if (missing.length || notPassing.length) {
    throw new InconsistentStateError(
      `Release-branch HEAD ${sha.slice(0, 7)} has not passed CI.\n` +
        (missing.length ? `  missing: ${missing.join(', ')}\n` : '') +
        (notPassing.length ? `  not green: ${notPassing.join(', ')}\n` : '') +
        `Wait for the push CI on this commit to finish successfully, then re-run.`,
    );
  }
}

async function inspectTag(
  { git, github }: CreateReleaseDeps,
  tag: string,
  headSha: string,
): Promise<ExistingTag> {
  const tagSha = await git.tagCommit(tag);
  let release: boolean;
  try {
    release = await github.releaseExists(tag);
  } catch (err) {
    throw new InconsistentStateError(
      `Could not determine the GitHub Release state for ${tag}: ${errorMessage(err)}. ` +
        `Refusing to make a release decision without it.`,
      { cause: err },
    );
  }
  if (!tagSha) return { state: 'absent', release };
  return { state: tagSha === headSha ? 'ok' : 'mismatch', release };
}
