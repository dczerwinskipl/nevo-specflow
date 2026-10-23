import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SpecificationDocumentResponse } from '@nevo/specflow-contracts/specs/workspace';
import { useAppServices } from '../../../app/useAppServices';
import { documentKeys } from '../read-model/queries';
import { specificationKeys } from '../../specs/read-model';
import {
  documentDraftKey,
  isDraftDirty,
  reconcileSavedDraft,
  type DocumentDraft,
} from './documentDraftStore';
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
  /** The failure, when `ok` is false. */
  readonly error?: unknown;
}

export interface SaveAllResult {
  /** Stored, or already clean (no request was sent). */
  readonly saved: string[];
  readonly failed: { id: string; error: unknown }[];
  /** Had no draft to save by the time its turn came (e.g. discarded during the series). */
  readonly skipped: string[];
}

export interface DocumentSaveOwner {
  /**
   * Saves one document of the spec (default: the one the session currently shows) from its draft.
   * Concurrent calls for the same document join the one in flight.
   */
  save: (documentId?: string) => Promise<SaveResult | undefined>;
  /**
   * Saves the documents one after another and stops at the first failure; ids after it are
   * neither saved nor listed. `saved` also holds clean documents (no request), `skipped` holds ids
   * without a draft. Edits made during IO stay dirty after their save succeeds, so callers MUST
   * re-check `dirtyIds` afterwards instead of trusting `saved` alone. The loop deliberately runs
   * to completion even if the caller unmounts, so no data is lost.
   */
  saveAll: (ids: readonly string[]) => Promise<SaveAllResult>;
  savingOf: (id: string) => boolean;
  errorOf: (id: string) => unknown;
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

  const save = useCallback(
    async (documentId?: string): Promise<SaveResult | undefined> => {
      const { specId: openSpec, document: open, draft: openDraft } = current.current;
      const id = documentId ?? open?.id;
      if (id === undefined) return undefined;
      // The shown document may only exist as a draft derived from its record; others live in the store.
      const source = id === open?.id ? openDraft : store.get(openSpec, id);
      if (!source) return undefined;
      const key = documentDraftKey(openSpec, id);
      const joined = inFlight.current.get(key);
      if (joined) return joined;
      const variables: SaveVariables = {
        specId: openSpec,
        documentId: id,
        content: source.content,
        expectedRevision: source.revision,
      };
      const base = {
        specId: variables.specId,
        documentId: variables.documentId,
        content: variables.content,
      };
      if (!isDraftDirty(source)) return { ok: true, ...base };
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
          return { ok: false, ...base, error };
        } finally {
          inFlight.current.delete(key);
          setPending((keys) => keys.filter((pendingKey) => pendingKey !== key));
        }
      })();
      inFlight.current.set(key, run);
      return run;
    },
    [mutateAsync, store],
  );

  const saveAll = useCallback(
    async (ids: readonly string[]): Promise<SaveAllResult> => {
      const outcome: SaveAllResult = { saved: [], failed: [], skipped: [] };
      for (const id of ids) {
        const result = await save(id);
        if (result?.ok === false) {
          outcome.failed.push({ id, error: result.error });
          break;
        }
        if (result) outcome.saved.push(id);
        else outcome.skipped.push(id);
      }
      return outcome;
    },
    [save],
  );

  const savingOf = useCallback(
    (id: string) => pending.includes(documentDraftKey(specId, id)),
    [pending, specId],
  );
  const errorOf = useCallback(
    (id: string): unknown => errors[documentDraftKey(specId, id)],
    [errors, specId],
  );

  const key = document ? documentDraftKey(specId, document.id) : undefined;
  return {
    save,
    saveAll,
    savingOf,
    errorOf,
    saving: key !== undefined && pending.includes(key),
    saveError: key === undefined ? undefined : errors[key],
  };
}
