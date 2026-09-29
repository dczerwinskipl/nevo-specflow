import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppWorkspaceSlots } from './AppWorkspace';

function region(label: string) {
  return { content: <div>{label}</div> };
}

describe('AppWorkspaceSlots', () => {
  it.each([
    ['primary', '75%', '25%'],
    ['balanced', '50%', '50%'],
    ['secondary', '25%', '75%'],
  ] as const)(
    'renders the %s split without changing the public slot order',
    (split, primary, secondary) => {
      const markup = renderToStaticMarkup(
        <AppWorkspaceSlots
          primary={region('Primary')}
          secondary={region('Secondary')}
          split={split}
        />,
      );

      expect(markup.indexOf('Primary')).toBeLessThan(markup.indexOf('Secondary'));
      expect(markup).toContain(`width:${primary}`);
      expect(markup).toContain(`width:${secondary}`);
      expect(markup).toContain('data-design-slot="primary"');
      expect(markup).toContain('data-design-slot="secondary"');
    },
  );

  it('adapts to a single 100% primary region when secondary content is absent', () => {
    const markup = renderToStaticMarkup(
      <AppWorkspaceSlots primary={region('Primary')} split="secondary" />,
    );

    expect(markup).toContain('width:100%');
    expect(markup).not.toContain('data-design-slot="secondary"');
  });
});

