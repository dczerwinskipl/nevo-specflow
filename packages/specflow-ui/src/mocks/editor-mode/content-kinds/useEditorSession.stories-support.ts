import { useState } from 'react';
import { DIRTY_SUFFIX, sourceOf } from './fixtures.stories-support';

/**
 * Editor-side state, owned by the CONTENT layer (the tab host never sees it): drafts and saved
 * text, the view of each tab (preview, edit, split ...) remembered per tab, image zoom, and the
 * editor preferences (word wrap and line numbers) shared by every tab.
 */
export function useEditorSession(initial: { dirty: string[]; views?: Record<string, string> }) {
  const [views, setViews] = useState<Record<string, string>>(initial.views ?? {});
  const [zooms, setZooms] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.dirty.map((id) => [id, sourceOf(id) + DIRTY_SUFFIX])),
  );
  // null = the default of the kind / layout (see wrapFor); line numbers default on.
  const [wrapPref, setWrapPref] = useState<boolean | null>(null);
  const [lineNumbers, setLineNumbers] = useState(true);

  const savedOf = (id: string) => saved[id] ?? sourceOf(id);
  const draftOf = (id: string) => drafts[id] ?? savedOf(id);
  return {
    views,
    zooms,
    wrapPref,
    setWrapPref,
    lineNumbers,
    setLineNumbers,
    draftOf,
    isDirty: (id: string) => draftOf(id) !== savedOf(id),
    save: (id: string) => setSaved((current) => ({ ...current, [id]: draftOf(id) })),
    discard: (id: string) =>
      setDrafts((current) => {
        const { [id]: _removed, ...rest } = current;
        return rest;
      }),
    edit: (id: string, value: string) => setDrafts((current) => ({ ...current, [id]: value })),
    setView: (id: string, view: string) => setViews((current) => ({ ...current, [id]: view })),
    /** `null` = Fit (no zoom). Zoom is kept per tab. */
    zoomTo: (id: string, value: number | null) =>
      setZooms((current) => {
        const { [id]: _removed, ...rest } = current;
        return value === null ? rest : { ...rest, [id]: value };
      }),
    zoom: (id: string, delta: number) =>
      setZooms((current) => ({
        ...current,
        [id]: Math.min(3, Math.max(0.5, (current[id] ?? 1) + delta)),
      })),
  };
}

export type EditorSession = ReturnType<typeof useEditorSession>;
