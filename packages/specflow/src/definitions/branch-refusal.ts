import { INITIAL_DEFINITIONS_BRANCH } from '@nevo/specflow-engine';

/**
 * What a person reads when the default definitions cannot be committed on the current branch: the
 * branch, why (the `git.commits` rule that refuses it) and every way out. Nothing changes the
 * protection by itself; the person chooses. Shared by `init` and `definitions install`.
 */
export function definitionsBranchRefusalLines(
  branch: string | undefined,
  reason: string | undefined,
): string[] {
  const name = branch !== undefined ? `'${branch}'` : 'the current branch';
  const notAllowed = reason === 'branch-not-allowed';

  return [
    `Nevo does not commit the definitions on ${name}: ` +
      (notAllowed
        ? 'it is not listed in git.commits.allowedBranches'
        : 'it is protected (git.commits.protectedBranches)') +
      ' in .nevo/config.yaml.',
    'Ways out:',
    `  - switch to a branch Nevo may commit on (for example: git switch -c ${INITIAL_DEFINITIONS_BRANCH}),` +
      ` run "nevo-specflow definitions install" there and merge that branch into ${name};`,
    notAllowed
      ? `  - or add ${name} to git.commits.allowedBranches in .nevo/config.yaml.`
      : `  - or remove ${name} from git.commits.protectedBranches in .nevo/config.yaml.`,
  ];
}
