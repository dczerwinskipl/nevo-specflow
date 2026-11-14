import { useEffect, useState, type ReactNode } from 'react';
import { Typography } from '../../foundations/Typography';
import { DiagramViewer, type DiagramViewerLabels } from './DiagramViewer';
import { useDiagram } from './mermaidDiagram';

export type MarkdownDiagramLabels = DiagramViewerLabels;

/** A changed source is drawn once it has been still this long (a live preview while typing). */
export const diagramSettleDelay = 500;

/**
 * The source to draw: the first one at once, a later one only after it stopped changing for
 * `diagramSettleDelay`, so typing neither draws on every keystroke nor flashes the failure note.
 */
function useSettledSource(source: string): string {
  const [settled, setSettled] = useState(source);

  useEffect(() => {
    if (settled === source) {
      return undefined;
    }

    const timer = setTimeout(() => setSettled(source), diagramSettleDelay);

    return () => clearTimeout(timer);
  }, [source, settled]);

  return settled;
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
  const settled = useSettledSource(source);
  const diagram = useDiagram(settled);
  // While the source changes, its code shows as it is, without a verdict on a half-written fence.
  const changing = settled !== source;

  if (diagram.status === 'ready' && !changing) {
    return (
      <DiagramViewer labels={labels} source={source} sourceLine={sourceLine} svg={diagram.svg} />
    );
  }

  return (
    <div
      {...sourceLine}
      className="my-3 first:mt-0 last:mb-0"
      data-markdown-diagram={changing ? 'changing' : diagram.status}
    >
      {codeBlock}
      {diagram.status === 'failed' && !changing ? (
        <Typography as="p" className="mt-1.5 text-content-muted" variant="body-sm">
          {labels.diagramFailed}
        </Typography>
      ) : null}
    </div>
  );
}
