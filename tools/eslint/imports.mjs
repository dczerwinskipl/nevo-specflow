// Shared helpers for `no-restricted-imports` blocks. All glob patterns in the fragments are relative
// to the package that loads them (a package's `eslint.config.mjs` is its flat-config base path).

export const productRelativeImportPattern = {
  regex: String.raw`^\.{1,2}/.*\.(?:js|jsx|mjs|cjs|ts|tsx|mts|cts)$`,
  message: 'Product-package relative TypeScript imports must be extensionless.',
};

export function productImportRestrictions(...patterns) {
  return ['error', { patterns: [productRelativeImportPattern, ...patterns] }];
}

/** Every TypeScript source of a product package, including config and test files. */
export const allTypeScript = ['**/*.{ts,tsx,mts,cts}'];

/** Product packages use extensionless relative TypeScript source imports. */
export const productRelativeImports = {
  files: allTypeScript,
  rules: { 'no-restricted-imports': productImportRestrictions() },
};

/** One `no-restricted-imports` block (package-wide unless `files` narrows it). */
export function restrict(patterns, files = allTypeScript, ignores) {
  return {
    files,
    ...(ignores ? { ignores } : {}),
    rules: { 'no-restricted-imports': productImportRestrictions(...patterns) },
  };
}
