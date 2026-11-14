import { useEffect, useState, type ReactNode } from 'react';
import type { Mermaid, MermaidConfig } from 'mermaid';
import { Typography } from '../../foundations/Typography';
import { ScrollArea } from '../../layout/ScrollArea';

/** Diagram types drawn at their natural size: a wide one scrolls in its block instead of shrinking. */
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

type DiagramState = { status: 'loading' } | { status: 'ready'; svg: string } | { status: 'failed' };

/** The drawing of `source`; a result that arrives for an older source is never shown. */
function useDiagram(source: string): DiagramState {
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

export interface MarkdownDiagramLabels {
  diagram: string;
  diagramFailed: string;
}

/**
 * A fenced `mermaid` block drawn as a diagram. While it is drawn, and when it cannot be drawn, the
 * ordinary code block shows instead (with a quiet note on failure), so the text is never lost.
 */
export function MarkdownDiagram({
  source,
  labels,
  codeBlock,
  sourceLine,
}: {
  source: string;
  labels: MarkdownDiagramLabels;
  /** The fence as an ordinary code block, without outer margins. */
  codeBlock: ReactNode;
  sourceLine: { 'data-source-line'?: number };
}) {
  const diagram = useDiagram(source);

  if (diagram.status === 'ready') {
    return (
      // A wide diagram scrolls in its own keyboard-focusable region and never widens the page.
      <ScrollArea
        {...sourceLine}
        aria-label={labels.diagram}
        className="my-3 rounded-composite border border-border-default bg-canvas first:mt-0 last:mb-0"
        data-markdown-diagram="ready"
        direction="horizontal"
        labelRole="group"
        viewportClassName="rounded-composite"
      >
        <div className="flex w-max min-w-full justify-center px-4 py-3">
          <div
            aria-label={labels.diagram}
            className="[&_svg]:block [&_svg]:max-w-none"
            dangerouslySetInnerHTML={{ __html: diagram.svg }}
            role="img"
          />
        </div>
      </ScrollArea>
    );
  }

  return (
    <div
      {...sourceLine}
      className="my-3 first:mt-0 last:mb-0"
      data-markdown-diagram={diagram.status}
    >
      {codeBlock}
      {diagram.status === 'failed' ? (
        <Typography as="p" className="mt-1.5 text-content-muted" variant="body-sm">
          {labels.diagramFailed}
        </Typography>
      ) : null}
    </div>
  );
}
