import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppShell } from '../shell/AppShell';
import { AppWorkspace } from './AppWorkspace';

function renderWorkspace(workspace: ReactNode) {
  return renderToStaticMarkup(<AppShell navigation={<div>Navigation</div>}>{workspace}</AppShell>);
}

describe('AppWorkspace composition API', () => {
  it('accepts a single primary region', () => {
    const html = renderWorkspace(
      <AppWorkspace>
        <AppWorkspace.Primary header="Primary header">
          <div>Primary content</div>
        </AppWorkspace.Primary>
      </AppWorkspace>,
    );

    expect(html).toContain('Primary header');
    expect(html).toContain('Primary content');
    expect(html).toContain('workspace-surface-material');
    expect(html).toContain('data-workspace-surface="primary"');
    expect(html).toContain('data-workspace-active="true"');
    expect(html).toContain('data-workspace-motion="idle"');
    expect(html.match(/workspace-surface-material/g)).toHaveLength(1);
    expect(html.match(/bg-app-base/g)).toHaveLength(1);
    expect(html).not.toContain('data-[layout=split]:bg-workspace');
  });

  it('accepts declarative primary and secondary regions', () => {
    const html = renderWorkspace(
      <AppWorkspace split="primary">
        <AppWorkspace.Primary header="Primary header">
          <div>Primary content</div>
        </AppWorkspace.Primary>
        <AppWorkspace.Secondary header="Secondary header">
          <div>Secondary content</div>
        </AppWorkspace.Secondary>
      </AppWorkspace>,
    );

    expect(html).toContain('Primary content');
    expect(html).not.toContain('Secondary content');
  });
});

