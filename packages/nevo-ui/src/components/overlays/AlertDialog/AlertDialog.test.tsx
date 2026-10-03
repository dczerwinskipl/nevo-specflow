import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AlertDialog, AlertDialogTrigger } from './AlertDialog';
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
});
