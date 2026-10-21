/**
 * Lazy access to the Vitest Browser Mode `page` object. Storybook story modules are also loaded
 * eagerly in plain Node (design capture registry), where a static `vitest/browser` import throws.
 */
export async function browserPage() {
  const { page } = await import('vitest/browser');
  return page;
}
