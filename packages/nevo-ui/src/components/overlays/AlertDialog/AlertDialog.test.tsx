import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AlertDialog, AlertDialogTrigger, AlertDialogFooter } from './AlertDialog';
describe('AlertDialog', () => {
  it('renders its trigger', () => {
    expect(
      renderToStaticMarkup(
        <AlertDialog>
          <AlertDialogTrigger>Delete</AlertDialogTrigger>
        </AlertDialog>,
      ),
    ).toContain('Delete');
  });
  it('stacks full-width actions when narrow and wraps a right-aligned row from sm', () => {
    const html = renderToStaticMarkup(
      <AlertDialogFooter>
        <button type="button">Cancel</button>
        <button type="button">Confirm</button>
      </AlertDialogFooter>,
    );
    // DOM order stays Cancel -> action (focus order); column-reverse puts the action on top.
    expect(html).toContain(
      'flex flex-col-reverse gap-2 *:min-w-0 *:w-full sm:flex-row sm:flex-wrap sm:justify-end sm:*:w-auto',
    );
    expect(html.indexOf('Cancel')).toBeLessThan(html.indexOf('Confirm'));
  });
});
