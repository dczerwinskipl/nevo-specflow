import type { ReactNode } from 'react';
import { Typography } from '../../foundations/Typography';
import { DiagramViewer, type DiagramViewerLabels } from './DiagramViewer';
import { useDiagram } from './mermaidDiagram';

export interface MarkdownDiagramLabels extends DiagramViewerLabels {
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
      <DiagramViewer labels={labels} source={source} sourceLine={sourceLine} svg={diagram.svg} />
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
