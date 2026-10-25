import { expect, waitFor, within } from 'storybook/test';

/**
 * Waits for the notification toast with `text` and checks it is announced once: the toast's own
 * transient status region is the only live region carrying the message.
 */
export async function expectToast(text: string | RegExp) {
  const viewport = await within(document.body).findByRole('region', { name: /^Notifications/ });
  await waitFor(() => expect(within(viewport).getByText(text)).toBeVisible());
  const matches = (node: Element) =>
    typeof text === 'string' ? node.textContent?.includes(text) : text.test(node.textContent ?? '');
  const live = [...document.querySelectorAll('[role="status"], [aria-live]')].filter(
    (node) => node.closest('[aria-live], [role="status"]') === node && matches(node),
  );
  await expect(live.length).toBeLessThanOrEqual(1);
}
