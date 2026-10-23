// Rule relaxations for tests, stories and test doubles.

/**
 * Storybook play functions and test doubles intentionally implement callback contracts that may be
 * async/no-op for only some scenarios.
 */
export function callbackDoubles(files) {
  return {
    files,
    rules: {
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  };
}

/**
 * Playwright's page-evaluation boundary is intentionally dynamic; assertions immediately validate
 * the returned browser values.
 */
export function playwrightEvaluation(files) {
  return {
    files,
    rules: {
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  };
}
