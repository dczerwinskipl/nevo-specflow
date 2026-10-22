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
  const tokens = compile(pattern);
  return tokens !== undefined && matchesTokens(tokens, branch);
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

/** One element of a compiled pattern. */
type Token =
  | { readonly kind: 'literal'; readonly char: string }
  | { readonly kind: 'any-char' }
  | { readonly kind: 'star' }
  | { readonly kind: 'globstar' }
  | {
      readonly kind: 'set';
      readonly negated: boolean;
      readonly ranges: readonly (readonly [string, string])[];
    };

/** Parses a pattern into tokens (`undefined` when its structure is invalid). */
function compile(pattern: string): readonly Token[] | undefined {
  const tokens: Token[] = [];
  let index = 0;
  while (index < pattern.length) {
    const character = pattern[index]!;
    if (character === '*') {
      let end = index;
      while (pattern[end] === '*') end++;
      tokens.push({ kind: end - index >= 2 ? 'globstar' : 'star' });
      index = end;
    } else if (character === '?') {
      tokens.push({ kind: 'any-char' });
      index++;
    } else if (character === '[') {
      const close = pattern.indexOf(']', index + 1);
      if (close < 0) return undefined;
      const set = compileSet(pattern.slice(index + 1, close));
      if (set === undefined) return undefined;
      tokens.push(set);
      index = close + 1;
    } else if (character === ']' || character === '!' || character === '^') {
      return undefined;
    } else {
      tokens.push({ kind: 'literal', char: character });
      index++;
    }
  }
  return tokens;
}

function compileSet(body: string): Token | undefined {
  const negated = body.startsWith('!') || body.startsWith('^');
  const members = negated ? body.slice(1) : body;
  if (members.length === 0) return undefined;
  const ranges: (readonly [string, string])[] = [];
  let index = 0;
  while (index < members.length) {
    const first = members[index]!;
    if (first === '-') {
      // A literal dash is only allowed first or last.
      if (index !== 0 && index !== members.length - 1) return undefined;
      ranges.push(['-', '-']);
      index++;
    } else if (!SET_MEMBER.test(first)) {
      return undefined;
    } else if (members[index + 1] === '-' && index + 2 < members.length) {
      const last = members[index + 2]!;
      if (!SET_MEMBER.test(last) || last < first) return undefined;
      ranges.push([first, last]);
      index += 3;
    } else {
      ranges.push([first, first]);
      index++;
    }
  }
  return { kind: 'set', negated, ranges };
}

/**
 * Linear-time matcher: the set of reachable token positions advances one character at a time, so
 * the cost is O(pattern length x branch length) whatever the number of wildcards. (A backtracking
 * regular expression is exponential for patterns such as `*a*a*a*a*b`.)
 */
function matchesTokens(tokens: readonly Token[], branch: string): boolean {
  const text = Array.from(branch);
  const width = tokens.length;
  let current = new Array<boolean>(width + 1).fill(false);
  current[0] = true;
  const skipEmptyStars = (states: boolean[]): void => {
    for (let at = 0; at < width; at++) {
      const token = tokens[at]!;
      if (states[at] && (token.kind === 'star' || token.kind === 'globstar')) states[at + 1] = true;
    }
  };
  skipEmptyStars(current);
  for (const character of text) {
    const next = new Array<boolean>(width + 1).fill(false);
    let alive = false;
    for (let at = 0; at < width; at++) {
      if (!current[at]) continue;
      const token = tokens[at]!;
      switch (token.kind) {
        case 'literal':
          if (character === token.char) next[at + 1] = true;
          break;
        case 'any-char':
          if (character !== '/') next[at + 1] = true;
          break;
        case 'star':
          if (character !== '/') next[at] = true;
          break;
        case 'globstar':
          next[at] = true;
          break;
        case 'set':
          if (character !== '/' && inSet(token, character)) next[at + 1] = true;
          break;
      }
    }
    skipEmptyStars(next);
    for (const reachable of next) alive ||= reachable;
    if (!alive) return false;
    current = next;
  }
  return current[width] === true;
}

function inSet(token: Extract<Token, { readonly kind: 'set' }>, character: string): boolean {
  const inside = token.ranges.some(([from, to]) => character >= from && character <= to);
  return token.negated ? !inside : inside;
}
