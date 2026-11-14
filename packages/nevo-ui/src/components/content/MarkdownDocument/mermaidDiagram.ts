import { useEffect, useState } from 'react';
import type { Mermaid, MermaidConfig } from 'mermaid';

/** Diagram types Mermaid draws at their natural size; the viewer scales and pans them itself. */
const naturalWidthDiagrams = [
  'flowchart',
  'sequence',
  'gantt',
  'journey',
  'timeline',
  'class',
  'state',
  'er',
  'pie',
  'quadrantChart',
  'xyChart',
  'requirement',
  'architecture',
  'mindmap',
  'kanban',
  'gitGraph',
  'c4',
  'sankey',
  'packet',
  'block',
  'radar',
] as const;

let mermaidModule: Promise<Mermaid> | undefined;
let renderCount = 0;

/** Loads Mermaid on first use only, so pages without a diagram never download it. */
function loadMermaid(): Promise<Mermaid> {
  mermaidModule ??= import('mermaid').then((module) => module.default);

  return mermaidModule;
}

/**
 * The Mermaid configuration from the design-system tokens of the document (read when a diagram is
 * drawn, so it follows the active colour scheme). Strict security: no scripts, no click handlers,
 * no HTML labels; a syntax error throws instead of drawing Mermaid's error graphic.
 */
function diagramConfig(): MermaidConfig {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(`--${name}`).trim();
  const canvas = token('color-canvas');
  const raised = token('color-surface-raised');
  const primary = token('color-content-primary');
  const secondary = token('color-content-secondary');
  const muted = token('color-content-muted');
  const border = token('color-border-strong');
  const subtle = token('color-border-default');
  const accent = token('color-action-primary');
  const themeVariables = Object.fromEntries(
    Object.entries({
      background: canvas,
      fontFamily: token('font-sans'),
      fontSize: '14px',
      // Flat shapes: the document's blocks carry no shadows.
      dropShadow: 'none',
      primaryColor: raised,
      primaryTextColor: primary,
      primaryBorderColor: border,
      secondaryColor: raised,
      secondaryTextColor: primary,
      secondaryBorderColor: border,
      tertiaryColor: canvas,
      tertiaryTextColor: secondary,
      tertiaryBorderColor: subtle,
      mainBkg: raised,
      nodeBorder: border,
      nodeTextColor: primary,
      textColor: secondary,
      titleColor: primary,
      lineColor: muted,
      clusterBkg: canvas,
      clusterBorder: subtle,
      edgeLabelBackground: canvas,
      actorBkg: raised,
      actorBorder: border,
      actorTextColor: primary,
      actorLineColor: muted,
      signalColor: muted,
      signalTextColor: secondary,
      labelBoxBkgColor: raised,
      labelBoxBorderColor: border,
      labelTextColor: primary,
      loopTextColor: secondary,
      noteBkgColor: raised,
      noteBorderColor: accent,
      noteTextColor: secondary,
      activationBkgColor: raised,
      activationBorderColor: accent,
    }).filter(([, value]) => value !== ''),
  );

  return {
    startOnLoad: false,
    securityLevel: 'strict',
    htmlLabels: false,
    suppressErrorRendering: true,
    theme: 'base',
    darkMode: style.colorScheme.includes('dark'),
    themeVariables,
    ...Object.fromEntries(naturalWidthDiagrams.map((type) => [type, { useMaxWidth: false }])),
  };
}

/** Draws one diagram to SVG markup (sanitised by Mermaid's strict mode); throws on a syntax error. */
async function renderDiagram(source: string): Promise<string> {
  const mermaid = await loadMermaid();
  mermaid.initialize(diagramConfig());
  // A fresh id per drawing: Mermaid removes any element that already carries the id it is given.
  renderCount += 1;
  const { svg } = await mermaid.render(`nevo-markdown-diagram-${renderCount}`, source);

  return svg;
}

export type DiagramState =
  { status: 'loading' } | { status: 'ready'; svg: string } | { status: 'failed' };

/** The drawing of `source`; a result that arrives for an older source is never shown. */
export function useDiagram(source: string): DiagramState {
  const [result, setResult] = useState<{ source: string; svg: string | null }>();

  useEffect(() => {
    let current = true;
    renderDiagram(source).then(
      (svg) => current && setResult({ source, svg }),
      () => current && setResult({ source, svg: null }),
    );

    return () => {
      current = false;
    };
  }, [source]);

  if (result?.source !== source) {
    return { status: 'loading' };
  }

  return result.svg === null ? { status: 'failed' } : { status: 'ready', svg: result.svg };
}
