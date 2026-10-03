import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { NavigationAdapter, NavigationNode } from '../NavigationCore';
import { SideNavigation } from './SideNavigation';
import { findUnsupportedNavigationDepth } from './diagnostics';

interface Target {
  href: string;
}

const nodes = [
  {
    key: 'workspace',
    label: 'Workspace',
    children: [
      { key: 'customers', label: 'Customers', target: { href: '#customers' } },
      {
        key: 'operations',
        label: 'Operations',
        children: [{ key: 'regions', label: 'Regions', target: { href: '#regions' } }],
      },
    ],
  },
  {
    key: 'projects',
    label: 'Projects',
    target: { href: '#projects' },
    children: [{ key: 'project-a', label: 'Project A', target: { href: '#project-a' } }],
  },
] as const satisfies readonly NavigationNode<Target>[];

function adapter(activeKey: string): NavigationAdapter<Target> {
  return {
    match: (node) => (node.key === activeKey ? 'active' : 'none'),
    renderLink: ({ children, className, isActive, node }) => (
      <a
        aria-current={isActive ? 'page' : undefined}
        className={className}
        href={node.target?.href}
      >
        {children}
      </a>
    ),
  };
}

describe('SideNavigation', () => {
  it('uses its optional section label as the accessible navigation name', () => {
    const markup = renderToStaticMarkup(
      <SideNavigation adapter={adapter('none')} label="Workspace" nodes={nodes} />,
    );
    const labelId = /aria-labelledby="([^"]+)"/.exec(markup)?.[1];

    expect(labelId).toBeDefined();
    expect(markup).toContain(`id="${labelId}"`);
    expect(markup).toContain('text-section-label uppercase');
    expect(markup).toContain('>Workspace</');
  });

  it('renders two native navigation levels and auto-expands the active path', () => {
    const markup = renderToStaticMarkup(
      <SideNavigation
        aria-label="Product navigation"
        adapter={adapter('customers')}
        nodes={nodes}
      />,
    );
    expect(markup.startsWith('<nav')).toBe(true);
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('aria-label="Collapse Workspace"');
    expect(markup).toContain('href="#customers"');
    expect(markup).toContain('data-navigation-depth="2"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('data-navigation-expanded-group="true"');
    expect(markup.match(/data-navigation-group-guide="true"/g)).toHaveLength(1);
    expect(markup.match(/data-navigation-active-indicator="true"/g)).toHaveLength(1);
    expect(markup).toContain('absolute inset-y-0 left-4 w-px');
    expect(markup).toContain('list-none gap-0.5 py-0 pl-6');
    expect(markup).toContain('-left-2 rounded-full');
    expect(markup).toContain('font-semibold');
  });

  it('leaves the outer surface to the consuming shell', () => {
    const markup = renderToStaticMarkup(
      <SideNavigation aria-label="Product navigation" adapter={adapter('none')} nodes={nodes} />,
    );
    expect(/^<nav[^>]+>/.exec(markup)?.[0]).not.toMatch(/border|rounded|bg-surface/);
  });

  it('keeps controlled expansion authoritative', () => {
    const markup = renderToStaticMarkup(
      <SideNavigation
        aria-label="Controlled navigation"
        adapter={adapter('customers')}
        expandedKeys={[]}
        nodes={nodes}
        onExpandedKeysChange={() => undefined}
      />,
    );
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain('href="#customers"');
  });

  it('uses one explicit expansion action for a root that is both target and branch', () => {
    const markup = renderToStaticMarkup(
      <SideNavigation
        aria-label="Project navigation"
        adapter={adapter('none')}
        defaultExpandedKeys={['projects']}
        nodes={nodes}
      />,
    );
    expect(markup.match(/data-navigation-expand-action="true"/g)).toHaveLength(1);
    expect(markup).toContain('href="#projects"');
    expect(markup).toContain('href="#project-a"');
    expect(markup).toContain('aria-label="Collapse Projects"');
  });

  it('localizes expansion action names separately from link names', () => {
    const markup = renderToStaticMarkup(
      <SideNavigation
        aria-label="Project navigation"
        adapter={adapter('none')}
        messages={{
          collapse: (label) => `Zwiń ${label}`,
          expand: (label) => `Rozwiń ${label}`,
        }}
        nodes={nodes}
      />,
    );

    expect(markup).toContain('href="#projects"');
    expect(markup).toContain('aria-label="Rozwiń Projects"');
  });

  it('reports every unsupported node without weakening Navigation Core', () => {
    expect(findUnsupportedNavigationDepth<Target>(nodes)).toEqual([
      { depth: 3, key: 'regions', path: ['workspace', 'operations', 'regions'] },
    ]);
  });
});
