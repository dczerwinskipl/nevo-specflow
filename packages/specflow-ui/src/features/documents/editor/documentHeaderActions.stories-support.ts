import type { StoryContext } from '@storybook/react-vite';
import { waitFor, within } from 'storybook/test';

type Canvas = StoryContext['canvas'];
type UserEvent = StoryContext['userEvent'];

/** Waits until the document header offers actions (directly or through its overflow menu). */
export async function waitForDocumentActions(canvas: Canvas) {
  await waitFor(
    () => {
      if (
        !canvas.queryByRole('button', { name: 'Edytuj dokument' }) &&
        !canvas.queryByRole('button', { name: 'Więcej akcji' })
      ) {
        throw new Error('Document header actions are not available');
      }
    },
    { timeout: 5000 },
  );
}

/**
 * Runs a document header action wherever the workspace placed it: as the direct primary button
 * (wide) or as an item of the header overflow menu (compact, or secondary actions).
 */
export async function invokeDocumentAction(canvas: Canvas, userEvent: UserEvent, name: string) {
  await waitForDocumentActions(canvas);
  const direct = canvas.queryByRole('button', { name });
  if (direct) {
    await userEvent.click(direct);

    return;
  }

  await userEvent.click(canvas.getByRole('button', { name: 'Więcej akcji' }));
  await userEvent.click(await within(document.body).findByRole('menuitem', { name }));
}
