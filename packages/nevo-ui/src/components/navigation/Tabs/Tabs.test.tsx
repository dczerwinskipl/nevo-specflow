import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Tabs } from './Tabs';

describe('Tabs', () => {
  it('connects tabs to panels and exposes roving-tabindex state', () => {
    const markup = renderToStaticMarkup(
      <Tabs defaultValue="overview">
        <Tabs.List aria-label="Customer record sections">
          <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
          <Tabs.Trigger disabled value="activity">
            Activity
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="overview">Overview content</Tabs.Content>
        <Tabs.Content value="activity">Activity content</Tabs.Content>
      </Tabs>,
    );
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('border-b-action-primary text-content-primary');
    expect(markup).toContain('border-b-transparent bg-transparent text-content-muted');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('role="tabpanel"');
    const selectedPanelId = markup.match(/aria-controls="([^"]+)"[^>]*aria-selected="true"/)?.[1];
    expect(selectedPanelId).toBeTruthy();
    expect(markup).toContain(`id="${selectedPanelId}"`);
  });
});

