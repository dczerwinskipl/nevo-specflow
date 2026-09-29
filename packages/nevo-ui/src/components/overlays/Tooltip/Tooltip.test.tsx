import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Tooltip, TooltipProvider, TooltipTrigger } from './Tooltip';
describe('Tooltip', () => {
  it('renders a focusable trigger composition', () => {
    expect(
      renderToStaticMarkup(
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>Info</TooltipTrigger>
          </Tooltip>
        </TooltipProvider>,
      ),
    ).toContain('Info');
  });
});
