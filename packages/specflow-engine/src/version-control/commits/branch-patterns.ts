/**
 * Branch-protection pattern rule of `git.commits.protectedBranches` / `allowedBranches`.
 *
 * fnmatch-style, close to GitHub's branch-protection patterns, matched case-sensitively against the
 * SHORT local branch name (no `refs/heads/`):
 *   `*`   any run of characters except `/`
 *   `**`  any run of characters including `/`
 *   `?`   exactly one character except `/`
 *   `[a-z]`, `[abc]`, `[!a-z]`  one character of the set (never `/`; `!` or `^` negates)
 * Everything else is literal. This is the Engine copy of `@nevo/specflow-contracts` `branch-protection.ts` (the Engine has no dependency on that package;
 * both copies are pinned to the same test vectors), so the UI previews exactly what the Engine decides.
 */
export const BRANCH_PATTERN_MAX_LENGTH = 200;
export const BRANCH_PATTERN_MAX_ENTRIES = 50;

export type BranchPatternProblem = 'empty' | 'too-long' | 'characters' | 'structure';

const PATTERN_CHARACTERS = /^[A-Za-z0-9._/*?[\]!^-]+$/u;
const SET_MEMBER = /^[A-Za-z0-9._]$/u;

/** Why a pattern is not acceptable, or `undefined` when it is valid. */
export function branchPatternProblem(pattern: string): BranchPatternProblem | undefined {
  if (pattern.length === 0) return 'empty';
  if (pattern.length > BRANCH_PATTERN_MAX_LENGTH) return 'too-long';
  if (!PATTERN_CHARACTERS.test(pattern)) return 'characters';
  if (
    pattern.startsWith('/') ||
    pattern.endsWith('/') ||
    pattern.includes('//') ||
    pattern.includes('..') ||
    pattern.startsWith('refs/') ||
    pattern.endsWith('.lock')
  ) {
    return 'structure';
  }
  return compile(pattern) === undefined ? 'structure' : undefined;
}

export function isValidBranchPattern(pattern: string): boolean {
  return branchPatternProblem(pattern) === undefined;
}

/** True when the branch matches the (valid) pattern; an invalid pattern never matches. */
export function matchesBranchPattern(pattern: string, branch: string): boolean {
  if (branchPatternProblem(pattern) !== undefined) return false;
  const expression = compile(pattern);
  return expression?.test(branch) === true;
}

export type EngineCommitRefusal = 'branch-protected' | 'branch-not-allowed';

/** The single predicate: protected always wins over allowed; no allow-list means "allowed". */
export function engineCommitRefusal(
  commits: {
    readonly protectedBranches: readonly string[];
    readonly allowedBranches?: readonly string[];
  },
  branch: string,
): EngineCommitRefusal | undefined {
  if (commits.protectedBranches.some((pattern) => matchesBranchPattern(pattern, branch))) {
    return 'branch-protected';
  }
  const allowed = commits.allowedBranches ?? [];
  if (allowed.length > 0 && !allowed.some((pattern) => matchesBranchPattern(pattern, branch))) {
    return 'branch-not-allowed';
  }
  return undefined;
}

const escape = (character: string): string => character.replace(/[\\^$.*+?()[\]{}|]/gu, '\\$&');

function compile(pattern: string): RegExp | undefined {
  let source = '';
  let index = 0;
  while (index < pattern.length) {
    const character = pattern[index]!;
    if (character === '*') {
      let end = index;
      while (pattern[end] === '*') end++;
      source += end - index >= 2 ? '.*' : '[^/]*';
      index = end;
    } else if (character === '?') {
      source += '[^/]';
      index++;
    } else if (character === '[') {
      const close = pattern.indexOf(']', index + 1);
      if (close < 0) return undefined;
      const set = compileSet(pattern.slice(index + 1, close));
      if (set === undefined) return undefined;
      source += set;
      index = close + 1;
    } else if (character === ']' || character === '!' || character === '^') {
      return undefined;
    } else {
      source += escape(character);
      index++;
    }
  }
  return new RegExp('^' + source + '$', 'u');
}

function compileSet(body: string): string | undefined {
  const negated = body.startsWith('!') || body.startsWith('^');
  const members = negated ? body.slice(1) : body;
  if (members.length === 0) return undefined;
  let source = '';
  let index = 0;
  while (index < members.length) {
    const first = members[index]!;
    if (first === '-') {
      // A literal dash is only allowed first or last.
      if (index !== 0 && index !== members.length - 1) return undefined;
      source += '\\-';
      index++;
    } else if (!SET_MEMBER.test(first)) {
      return undefined;
    } else if (members[index + 1] === '-' && index + 2 < members.length) {
      const last = members[index + 2]!;
      if (!SET_MEMBER.test(last) || last < first) return undefined;
      source += escape(first) + '-' + escape(last);
      index += 3;
    } else {
      source += escape(first);
      index++;
    }
  }
  return negated ? '[^/' + source + ']' : '[' + source + ']';
}
