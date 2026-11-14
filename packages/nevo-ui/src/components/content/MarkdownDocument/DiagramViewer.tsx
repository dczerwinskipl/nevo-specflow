import { useState, type ReactNode } from 'react';
import { IconButton } from '../../actions/IconButton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../overlays/Dialog';
import { cn } from '../../../lib';
import { Spinner } from '../../feedback/Spinner';
import { Typography } from '../../foundations/Typography';
import { hitAreaClassName } from '../../../design-system/interactionRecipes';
import { naturalSize } from './diagramView';
import { useDiagram } from './mermaidDiagram';
import { diagramInset, useDiagramView } from './useDiagramView';

export interface DiagramViewerLabels {
  /** Accessible name of the diagram (its region and its picture) and the full-screen title. */
  diagram: string;
  diagramZoomIn: string;
  diagramZoomOut: string;
  diagramReset: string;
  diagramFullScreen: string;
  diagramClose: string;
  /** Quiet note when a diagram cannot be drawn. */
  diagramFailed: string;
}

/** Mermaid's shapes carry drop-shadow filters (sequence actors); the document's blocks have none. */
const drawingClassName =
  '[&_svg]:block [&_svg]:size-full [&_svg]:max-w-none [&_svg_*]:filter-none!';

function DiagramControls({
  labels,
  zoom,
  children,
}: {
  labels: DiagramViewerLabels;
  zoom: ReturnType<typeof useDiagramView>;
  children?: ReactNode;
}) {
  const button = 'shrink-0 ' + hitAreaClassName;

  return (
    <div className="flex items-center gap-0.5 rounded-control bg-surface-control p-0.5">
      <IconButton
        aria-label={labels.diagramZoomOut}
        title={labels.diagramZoomOut}
        className={button}
        disabled={!zoom.canZoomOut}
        icon="zoom-out"
        onClick={zoom.zoomOut}
        size="sm"
        variant="ghost"
      />
      <IconButton
        aria-label={labels.diagramZoomIn}
        title={labels.diagramZoomIn}
        className={button}
        disabled={!zoom.canZoomIn}
        icon="zoom-in"
        onClick={zoom.zoomIn}
        size="sm"
        variant="ghost"
      />
      <IconButton
        aria-label={labels.diagramReset}
        title={labels.diagramReset}
        className={button}
        disabled={zoom.fitted}
        icon="zoom-fit"
        onClick={zoom.reset}
        size="sm"
        variant="ghost"
      />
      {children}
    </div>
  );
}

/**
 * The drawing in its zoomable, pannable viewport. The viewport is one keyboard stop (`+`/`-`
 * zoom, arrows pan, `0` resets); plain wheel and one-finger touch scroll the page.
 */
function DiagramViewport({
  svg,
  label,
  zoom,
  className,
}: {
  svg: string;
  label: string;
  zoom: ReturnType<typeof useDiagramView>;
  className?: string;
}) {
  const size = naturalSize(svg);
  const { view } = zoom;

  return (
    <div
      {...zoom.viewportProps}
      ref={zoom.viewportRef}
      aria-label={label}
      className={cn(
        // The focus ring is drawn by `::after`, above the drawing (whose shapes would cover an outline).
        "relative overflow-hidden outline-none [touch-action:pan-x_pan-y] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-focus-ring",
        zoom.pannable && 'cursor-grab active:cursor-grabbing',
        className,
      )}
      data-diagram-scale={view.scale.toFixed(3)}
      role="group"
      style={zoom.height === undefined ? undefined : { height: zoom.height }}
      tabIndex={0}
    >
      <div
        aria-label={label}
        className={cn('absolute left-0 top-0 origin-top-left select-none', drawingClassName)}
        dangerouslySetInnerHTML={{ __html: svg }}
        role="img"
        style={{
          width: size.width,
          height: size.height,
          transform: `translate(${view.x + diagramInset}px, ${view.y + diagramInset}px) scale(${view.scale})`,
        }}
      />
    </div>
  );
}

/** Full screen: a second drawing (its own SVG ids), fitted to the window, same zoom and pan. */
const frameClassName = 'rounded-composite border border-border-default bg-canvas';

function FullScreenDiagram({ source, labels }: { source: string; labels: DiagramViewerLabels }) {
  const diagram = useDiagram(source);
  const svg = diagram.status === 'ready' ? diagram.svg : '';
  const zoom = useDiagramView(naturalSize(svg), 'window');

  return (
    <DialogContent
      aria-describedby={undefined}
      className="h-[calc(100dvh-2rem)]! w-[calc(100vw-2rem)]! gap-3! p-3!"
      closeLabel={labels.diagramClose}
    >
      <DialogHeader className="flex! min-h-control-height-compact items-center justify-between gap-3 pr-10">
        <DialogTitle className="pl-2">{labels.diagram}</DialogTitle>
        <DiagramControls labels={labels} zoom={zoom} />
      </DialogHeader>
      {diagram.status === 'ready' ? (
        <DiagramViewport
          className={`${frameClassName} min-h-0 flex-1`}
          label={labels.diagram}
          svg={svg}
          zoom={zoom}
        />
      ) : (
        // Its own drawing is still being made (or could not be made): say so, never a blank frame.
        <div
          aria-busy={diagram.status === 'loading'}
          className={`${frameClassName} flex min-h-0 flex-1 items-center justify-center`}
        >
          {diagram.status === 'loading' ? (
            <Spinner />
          ) : (
            <Typography as="p" className="text-content-muted" variant="body-sm">
              {labels.diagramFailed}
            </Typography>
          )}
        </div>
      )}
    </DialogContent>
  );
}

/**
 * A drawn diagram in the document: fitted to the column (text never below 10 px; a small diagram
 * keeps its natural size), with zoom, pan and full screen in a quiet cluster above the drawing.
 */
export function DiagramViewer({
  svg,
  source,
  labels,
  sourceLine,
}: {
  svg: string;
  source: string;
  labels: DiagramViewerLabels;
  sourceLine: { 'data-source-line'?: number };
}) {
  const zoom = useDiagramView(naturalSize(svg), 'inline');
  const [fullScreen, setFullScreen] = useState(false);

  return (
    <div
      {...sourceLine}
      className="my-3 overflow-hidden rounded-composite border border-border-default bg-canvas first:mt-0 last:mb-0"
      data-markdown-diagram="ready"
    >
      {/* The controls sit in their own strip, so they never cover the drawing. */}
      <div className="flex justify-end px-1.5 pt-1.5">
        <DiagramControls labels={labels} zoom={zoom}>
          <Dialog open={fullScreen} onOpenChange={setFullScreen}>
            <DialogTrigger asChild>
              <IconButton
                aria-label={labels.diagramFullScreen}
                title={labels.diagramFullScreen}
                className={'shrink-0 ' + hitAreaClassName}
                icon="fullscreen"
                size="sm"
                variant="ghost"
              />
            </DialogTrigger>
            {fullScreen ? <FullScreenDiagram labels={labels} source={source} /> : null}
          </Dialog>
        </DiagramControls>
      </div>
      <DiagramViewport label={labels.diagram} svg={svg} zoom={zoom} />
    </div>
  );
}
