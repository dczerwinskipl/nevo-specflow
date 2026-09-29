import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Menu, MenuTrigger, menuItemVariants } from './Menu';

describe('Menu', () => {
  it('preserves an existing trigger element through asChild composition', () => {
    const markup = renderToStaticMarkup(
      <Menu>
        <MenuTrigger asChild>
          <button type="button">Actions</button>
        </MenuTrigger>
      </Menu>,
    );
    expect(markup).toContain('<button type="button"');
    expect(markup).toContain('aria-haspopup="menu"');
  });

  it('keeps danger and disabled presentation explicit', () => {
    expect(menuItemVariants({ tone: 'danger' })).toContain('text-action-danger');
    expect(menuItemVariants({ tone: 'danger' })).toContain('data-[tone=danger]:text-action-danger');
    expect(menuItemVariants({ state: 'disabled', tone: 'danger' })).toContain('opacity-50');
    expect(menuItemVariants({ state: 'disabled', tone: 'danger' })).toContain(
      'data-[tone=danger]:data-[disabled]:text-content-muted',
    );
  });
});
