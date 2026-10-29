/**
 * Git branch-name rule for a user-typed Create override. It is the conservative subset the Engine
 * accepts (the Engine keeps its own copy because it has no dependency on this package; a Runtime
 * test pins both to the same results), so the UI can reject exactly what the Engine would.
 */
export const BRANCH_NAME_MAX_LENGTH = 240;

const BRANCH_CHARACTERS = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/u;

export type BranchNameProblem = 'empty' | 'too-long' | 'characters' | 'structure';

/** Why a branch name is not acceptable, or `undefined` when it is valid. */
export function branchNameProblem(value: string): BranchNameProblem | undefined {
  if (value.length === 0) {
    return 'empty';
  }

  if (value.length > BRANCH_NAME_MAX_LENGTH) {
    return 'too-long';
  }

  if (!BRANCH_CHARACTERS.test(value)) {
    return 'characters';
  }

  if (
    value.includes('//') ||
    value.includes('..') ||
    value.endsWith('/') ||
    value.endsWith('.') ||
    value.split('/').some((part) => part.startsWith('.') || part.endsWith('.lock'))
  ) {
    return 'structure';
  }

  return undefined;
}

export function isValidBranchName(value: string): boolean {
  return branchNameProblem(value) === undefined;
}
