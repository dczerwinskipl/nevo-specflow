import { useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useBlocker } from '@tanstack/react-router';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';
import { useDocumentDraft, useDocumentDraftStore } from './DocumentDraftProvider';
import { isDraftDirty } from './documentDraftStore';
import { useDocumentEditor } from './DocumentEditorProvider';
/** Route departure is guarded above panes so closing/back/focus never destroys protection. */
export function DocumentRouteGuard({
  specId,
  documentId,
  requestRef,
}: {
  specId: string;
  documentId?: string;
  requestRef?: RefObject<(() => Promise<boolean>) | null>;
}) {
  const store = useDocumentDraftStore();
  const draft = useDocumentDraft(specId, documentId ?? '');
  const dirty = Boolean(draft && isDraftDirty(draft));
  // The single owner of leave-document requests (tree operations, route departures): they share the
  // one open dialog and every waiting request settles with its decision.
  const waiting = useRef<((allow: boolean) => void)[]>([]);
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const editor = useDocumentEditor();
  const ask = () =>
    new Promise<boolean>((resolve) => {
      waiting.current.push(resolve);
      setOpen(true);
    });
  const settleAll = (allow: boolean) => {
    for (const resolve of waiting.current.splice(0)) resolve(allow);
  };
  // Nobody can answer once the guard is gone: staying is the safe answer, never a hanging promise.
  useEffect(() => () => settleAll(false), []);
  useEffect(() => {
    if (!requestRef) return;
    requestRef.current = () => (!dirty ? Promise.resolve(true) : ask());
    return () => {
      requestRef.current = null;
    };
  }, [dirty, requestRef]);
  useBlocker({
    // The router blocks when this resolves true, so a granted departure resolves false.
    shouldBlockFn: () => (!dirty ? false : ask().then((allow) => !allow)),
    enableBeforeUnload: dirty,
  });
  const finish = (allow: boolean) => {
    setOpen(false);
    settleAll(allow);
  };
  const discard = () => {
    if (draft)
      store.set(specId, documentId ?? '', {
        ...draft,
        content: draft.baseline,
        editing: draft.editing,
      });
    finish(true);
  };
  /** The one Save owner (shared with the header and the shortcut); the guard only reacts to its result. */
  const save = async () => {
    if (!editor || editor.document.id !== documentId) return;
    if (await editor.save()) finish(true);
  };
  return (
    <UnsavedChangesDialog
      open={open}
      description={t('documents.guard.description')}
      saveLabel={t('documents.guard.save')}
      pending={editor?.saving ?? false}
      saveFailed={editor?.saveError !== undefined}
      onContinue={() => finish(false)}
      onDiscard={discard}
      onSave={() => void save()}
    />
  );
}
