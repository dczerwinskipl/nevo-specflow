import { useLayoutEffect, useState } from 'react';

/**
 * The inner size of a document's scroll panel (px; 0 until it is mounted). `measured` is false until the first read. The panel, not the
 * window, decides the reading arrangement, so a document reads the same in any pane. Read in a
 * layout effect, so the first arrangement is committed before the first paint.
 */
export function usePanelSize(panel: HTMLElement | null) {
  const [size, setSize] = useState({ width: 0, height: 0, measured: false });
  useLayoutEffect(() => {
    if (!panel) {
      return;
    }

    const measure = () => {
      const width = panel.clientWidth;
      const height = panel.clientHeight;
      setSize((previous) =>
        previous.measured && previous.width === width && previous.height === height
          ? previous
          : { width, height, measured: true },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);

    return () => observer.disconnect();
  }, [panel]);

  return size;
}
