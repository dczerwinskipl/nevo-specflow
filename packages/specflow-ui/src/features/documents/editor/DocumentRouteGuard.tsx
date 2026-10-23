import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useBlocker } from '@tanstack/react-router';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';
import { useDirtyDocuments, useDocumentDraftStore } from './DocumentDraftProvider';
import { useDocumentSaveOps } from './DocumentEditorProvider';
import { isWithinSpecDocuments } from '../../../app/navigation/routeScope';
import { useDocumentTabs } from '../tabs/DocumentTabsProvider';

/**
 * Leaving the Documents screen is guarded above the panes, so closing, Back or focus changes never
 * destroy the protection. Switching, opening and closing tabs stay inside the screen and never
 * ask here (closing a tab asks about THAT tab). Leaving the screen, switching specification, a tree
 * operation or a page unload asks ONCE, listing every document with unsaved changes.
 */
export function DocumentRouteGuard({
  specId,
  requestRef,
  commitRef,
}: {
  specId: string;
  /** Asks to leave the unsaved documents (tree operations, closing every tab); false = keep editing. */
  requestRef?: RefObject<(() => Promise<boolean>) | null>;
  /**
   * Called by whoever asked, once what the answer allowed has happened (the tabs closed, the
   * operation went on): only then do the drafts the user discarded go.
   */
  commitRef?: RefObject<(() => void) | null>;
}) {
  const store = useDocumentDraftStore();
  const ops = useDocumentSaveOps();
  const { tabs } = useDocumentTabs();
  const dirtyIds = useDirtyDocuments(specId);
  const { t } = useTranslation();
  // The single owner of leave requests (tree operations, route departures, closing every tab):
  // they share the one open dialog and every waiting request settles with its decision.
  const waiting = useRef<((allow: boolean) => void)[]>([]);
  // Documents the user chose to discard, removed once the departure has really happened.
  const discarded = useRef<string[]>([]);
  const mounted = useRef(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Documents that stayed unsaved after Save all, listed with the failure.
  const [failed, setFailed] = useState<readonly string[]>([]);

  const ask = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        if (waiting.current.length === 0) discarded.current = [];
        waiting.current.push(resolve);
        setOpen(true);
      }),
    [],
  );
  const commit = useCallback(() => {
    for (const id of discarded.current.splice(0)) store.remove(specId, id);
  }, [store, specId]);
  const finish = useCallback((allow: boolean) => {
    setOpen(false);
    setFailed([]);
    for (const resolve of waiting.current.splice(0)) resolve(allow);
  }, []);
  // Nobody can answer once the guard is gone: staying is the safe answer, never a hanging promise.
  useEffect(() => {
    mounted.current = true;
    // The queue is one array for the guard's whole life (it is only ever spliced).
    const queue = waiting.current;
    return () => {
      mounted.current = false;
      for (const resolve of queue.splice(0)) resolve(false);
    };
  }, []);
  // The guard unmounts when the screen or the specification really changes: a discard that was
  // granted for that departure is carried out now (a refused departure keeps the guard, and the drafts).
  useEffect(() => commit, [commit]);
  useEffect(() => {
    if (!commitRef) return;
    commitRef.current = commit;
    return () => {
      commitRef.current = null;
    };
  }, [commit, commitRef]);
  const anyUnsaved = useCallback(() => store.dirtyIds(specId).length > 0, [store, specId]);

  useEffect(() => {
    if (!requestRef) return;
    requestRef.current = () => (anyUnsaved() ? ask() : Promise.resolve(true));
    return () => {
      requestRef.current = null;
    };
  }, [anyUnsaved, ask, requestRef]);
  useBlocker({
    // The router blocks when this resolves true, so a granted departure resolves false.
    shouldBlockFn: ({ current, next }) => {
      if (isWithinSpecDocuments(current, next, specId)) return false;
      return anyUnsaved() ? ask().then((allow) => !allow) : false;
    },
    enableBeforeUnload: anyUnsaved,
  });

  const discardAll = () => {
    // Same contract as discarding a tab: no draft stays behind, so a reopened document is clean.
    // It goes once the answer has been acted on, so a refused departure keeps the edits.
    discarded.current = store.dirtyIds(specId);
    finish(true);
  };
  const saveAll = async () => {
    setSaving(true);
    setFailed([]);
    try {
      await ops.saveAll(store.dirtyIds(specId));
    } catch {
      // A save that throws leaves its document unsaved: it is listed below like any other failure.
    } finally {
      if (mounted.current) setSaving(false);
    }
    if (!mounted.current) return;
    // `saved` is not proof: edits made during IO stay dirty, failures and skipped ids as well.
    const left = store.dirtyIds(specId);
    if (left.length === 0) finish(true);
    else setFailed(left);
  };
  const labelOf = (id: string) => tabs.find((tab) => tab.id === id)?.label ?? id;
  return (
    <UnsavedChangesDialog
      open={open}
      description={t('documents.guard.listDescription')}
      details={
        <ul className="grid gap-1 text-body-sm" aria-label={t('documents.unsaved')}>
          {dirtyIds.map((id) => (
            <li key={id} className="flex min-w-0 gap-2">
              <span className="truncate">{labelOf(id)}</span>
              {failed.includes(id) && (
                <span className="shrink-0 text-content-muted">
                  {` (${t('documents.guard.notSaved')})`}
                </span>
              )}
            </li>
          ))}
        </ul>
      }
      saveLabel={t('documents.guard.saveAll')}
      discardLabel={t('documents.guard.discardAll')}
      failureTitle={t('documents.guard.saveAllFailed')}
      pending={saving}
      saveFailed={failed.length > 0}
      onContinue={() => finish(false)}
      onDiscard={discardAll}
      onSave={() => void saveAll()}
    />
  );
}
