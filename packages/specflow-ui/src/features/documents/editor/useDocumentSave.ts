import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SpecificationDocumentResponse } from '@nevo/specflow-contracts/specs/workspace';
import { useAppServices } from '../../../app/useAppServices';
import { documentKeys } from '../queries';
import { specificationKeys } from '../../specs';
import { documentDraftKey, reconcileSavedDraft, type DocumentDraft } from './documentDraftStore';
import { useDocumentDraftStore } from './DocumentDraftProvider';

/** Everything that identifies one save: the resource, the submitted snapshot and its revision. */
export interface SaveVariables {
  readonly specId: string;
  readonly documentId: string;
  readonly content: string;
  readonly expectedRevision: string;
}

export interface SaveResult {
  /** True when the submitted snapshot is stored (or there was nothing to store). */
  readonly ok: boolean;
  readonly specId: string;
  readonly documentId: string;
  /** The snapshot this result is about; later edits of the same document may differ. */
  readonly content: string;
}

export interface DocumentSaveOwner {
  /** Saves the document the session currently shows. Concurrent calls join the one in flight. */
  save: () => Promise<SaveResult | undefined>;
  /** Whether the CURRENT document has a save in flight. */
  saving: boolean;
  /** The last failure of the CURRENT document's save, until its next attempt. */
  saveError: unknown;
}

/**
 * The single owner of the Save operation for the open document. The header action, the keyboard
 * shortcut and the leave-document dialog all call `save`, so there is one `saving` flag, one error
 * and one request. The mutation variables carry the resource identity: its callbacks update only
 * the draft and cache entry those variables describe, never whatever document is open when the
 * response arrives.
 */
export function useDocumentSave({
  specId,
  document,
  draft,
}: {
  specId: string;
  document?: SpecificationDocumentResponse;
  draft?: DocumentDraft;
}): DocumentSaveOwner {
  const { documentsApi } = useAppServices();
  const cache = useQueryClient();
  const store = useDocumentDraftStore();
  // Read at event time only (never during render and never for the identity of a finished save).
  const current = useRef({ specId, document, draft });
  useLayoutEffect(() => {
    current.current = { specId, document, draft };
  });
  const inFlight = useRef(new Map<string, Promise<SaveResult>>());
  const [pending, setPending] = useState<readonly string[]>([]);
  const [errors, setErrors] = useState<Readonly<Record<string, unknown>>>({});

  const mutation = useMutation({
    mutationFn: (variables: SaveVariables) =>
      documentsApi.save(variables.specId, variables.documentId, {
        content: variables.content,
        expectedRevision: variables.expectedRevision,
      }),
    onSuccess: async (result, variables) => {
      store.update(variables.specId, variables.documentId, (saved) =>
        saved
          ? reconcileSavedDraft(saved, variables.content, result.revision)
          : {
              content: variables.content,
              baseline: variables.content,
              revision: result.revision,
              editing: false,
            },
      );
      cache.setQueryData<SpecificationDocumentResponse>(
        documentKeys.detail(variables.specId, variables.documentId),
        (existing) =>
          existing
            ? { ...existing, content: variables.content, revision: result.revision }
            : existing,
      );
      await cache.invalidateQueries({
        queryKey: specificationKeys.detail(variables.specId),
        exact: true,
      });
    },
  });
  const { mutateAsync } = mutation;

  const save = useCallback(async (): Promise<SaveResult | undefined> => {
    const { specId: openSpec, document: open, draft: openDraft } = current.current;
    if (!open || !openDraft) return undefined;
    const key = documentDraftKey(openSpec, open.id);
    const joined = inFlight.current.get(key);
    if (joined) return joined;
    const variables: SaveVariables = {
      specId: openSpec,
      documentId: open.id,
      content: openDraft.content,
      expectedRevision: openDraft.revision,
    };
    const base = {
      specId: variables.specId,
      documentId: variables.documentId,
      content: variables.content,
    };
    if (openDraft.content === openDraft.baseline) return { ok: true, ...base };
    const run = (async (): Promise<SaveResult> => {
      setErrors((all) => {
        const rest = { ...all };
        delete rest[key];
        return rest;
      });
      setPending((keys) => [...keys, key]);
      try {
        await mutateAsync(variables);
        return { ok: true, ...base };
      } catch (error) {
        setErrors((all) => ({ ...all, [key]: error }));
        return { ok: false, ...base };
      } finally {
        inFlight.current.delete(key);
        setPending((keys) => keys.filter((pendingKey) => pendingKey !== key));
      }
    })();
    inFlight.current.set(key, run);
    return run;
  }, [mutateAsync]);

  const key = document ? documentDraftKey(specId, document.id) : undefined;
  return {
    save,
    saving: key !== undefined && pending.includes(key),
    saveError: key === undefined ? undefined : errors[key],
  };
}
