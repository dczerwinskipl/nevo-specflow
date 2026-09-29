import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Dialog, DialogTrigger } from './Dialog';
describe('Dialog', () => {
  it('renders its trigger', () => {
    expect(
      renderToStaticMarkup(
        <Dialog>
          <DialogTrigger>Open</DialogTrigger>
        </Dialog>,
      ),
    ).toContain('Open');
  });
});

