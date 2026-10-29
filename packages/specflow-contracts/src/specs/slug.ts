/**
 * Specification slug rule shared by the Create contract, the Engine and the UI preview.
 * The slug names the Spec folder, the generated branch (`feature/<slug>`) and the worktree folder.
 * The Engine keeps its own copy of the derivation (it has no dependency on this package); a Runtime
 * test pins both to the same results.
 */
export const SPEC_SLUG_MAX_LENGTH = 80;

/** Lowercase kebab-case ASCII: alphanumeric groups joined by single hyphens. */
export const SPEC_SLUG_PATTERN = '^[a-z0-9]+(?:-[a-z0-9]+)*$';

const SLUG_REGEX = new RegExp(SPEC_SLUG_PATTERN, 'u');
// Windows device names are reserved even with an extension.
const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/u;

export type SpecSlugProblem = 'empty' | 'format' | 'too-long' | 'reserved';

/** Why a user-typed slug is not acceptable, or `undefined` when it is valid. */
export function specSlugProblem(value: string): SpecSlugProblem | undefined {
  if (value.length === 0) {
    return 'empty';
  }

  if (value.length > SPEC_SLUG_MAX_LENGTH) {
    return 'too-long';
  }

  if (!SLUG_REGEX.test(value)) {
    return 'format';
  }

  if (WINDOWS_DEVICE.test(value)) {
    return 'reserved';
  }

  return undefined;
}

export function isValidSpecSlug(value: string): boolean {
  return specSlugProblem(value) === undefined;
}

/**
 * Slug the Engine derives from a title (diacritics folded, `ł` -> `l`, non-alphanumerics -> `-`,
 * at most 80 characters). An empty result means the Engine falls back to `spec-<short id>`.
 */
export function deriveSpecSlug(title: string): string {
  return title
    .replace(/\s+/gu, ' ')
    .trim()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replace(/ł/gu, 'l')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, SPEC_SLUG_MAX_LENGTH)
    .replace(/-+$/gu, '');
}
