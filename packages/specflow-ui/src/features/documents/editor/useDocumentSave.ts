import type { DocumentContent } from '@nevo/specflow-contracts/documents';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppServices } from '../../../app/useAppServices';
import { apiErrorCode, writeOutcomeUnknown } from '../../../shared/http/apiErrorCode';
import { newId } from '../../../shared/ids/newId';
import { documentKeys, documentTreeKeys } from '../read-model/queries';
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
  /** Idempotency key of this save (a new one per submitted snapshot). */
  readonly operationId: string;
  /** Captured at submission time so a late response cannot overwrite a reopened draft. */
  readonly incarnation: number;
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
  /** The save made a commit (false only when Git is disabled); absent when nothing was sent. */
  readonly committed?: boolean;
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
  save: (documentId?: string, options?: { resume?: boolean }) => Promise<SaveResult | undefined>;
  /**
   * Saves each distinct document once, in input order, and stops at the first failure; ids after it are
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
  /** Forgets the failure of a document's save (the user resolved it, for example a conflict). */
  clearError: (id: string) => void;
  /**
   * A document got a new id: its refused save (the conflict banner) and a save to resume follow it,
   * so neither is orphaned under the old id.
   */
  follow: (from: string, to: string) => void;
  /**
   * A save of the document is running (`saving`) or was written but not committed and waits for
   * Resume (`recovery`); read when an operation would give the document a new id.
   */
  pendingOf: (id: string) => 'saving' | 'recovery' | undefined;
}

/** The save was written but not committed: it is resumed with the same operation id and content. */
const recoveryCode = 'DOCUMENT_RECOVERY_REQUIRED';

/**
 * A save sent whose result is not final: written but not committed (`recovery`, finished by
 * Resume), or without an answer (`unknown`, the server may have applied it). Retrying it sends
 * exactly the same operation, so the user's own write never comes back as a conflict.
 */
interface RetainedSave {
  readonly variables: SaveVariables;
  readonly reason: 'recovery' | 'unknown';
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
  document?: DocumentContent;
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
  // Saves that must be resumed as they were sent (same operation id); owned by `save` only.
  const retained = useRef(new Map<string, RetainedSave>());
  /**
   * The retained save of a document while it still describes the draft: same incarnation (not
   * discarded or closed since) and the same text. A discarded, reloaded or edited draft drops it,
   * so a new edit is a new save and a clean draft sends nothing.
   */
  const retainedFor = useCallback(
    (spec: string, id: string): RetainedSave | undefined => {
      const key = documentDraftKey(spec, id);
      const entry = retained.current.get(key);
      if (!entry) return undefined;
      if (
        entry.variables.incarnation === store.incarnation(spec, id) &&
        store.get(spec, id)?.content === entry.variables.content
      )
        return entry;
      retained.current.delete(key);
      return undefined;
    },
    [store],
  );
  const [pending, setPending] = useState<readonly string[]>([]);
  const [errors, setErrors] = useState<Readonly<Record<string, unknown>>>({});

  const mutation = useMutation({
    mutationFn: (variables: SaveVariables) =>
      documentsApi.save(variables.specId, variables.documentId, {
        operationId: variables.operationId,
        content: variables.content,
        expectedRevision: variables.expectedRevision,
      }),
    onSuccess: async (result, variables) => {
      // A response from a discarded incarnation cannot modify a new draft or its cache.
      if (store.incarnation(variables.specId, variables.documentId) === variables.incarnation) {
        store.update(variables.specId, variables.documentId, (saved) =>
          saved ? reconcileSavedDraft(saved, variables.content, result.revision) : undefined,
        );
        cache.setQueryData<DocumentContent>(
          documentKeys.detail(variables.specId, variables.documentId),
          (existing) =>
            existing
              ? {
                  ...existing,
                  content: variables.content,
                  size: new TextEncoder().encode(variables.content).length,
                  revision: result.revision,
                }
              : existing,
        );
      } else {
        await cache.invalidateQueries({
          queryKey: documentKeys.detail(variables.specId, variables.documentId),
          exact: true,
        });
      }
      await cache.invalidateQueries({
        queryKey: specificationKeys.detail(variables.specId),
        exact: true,
      });
    },
    // The tree changes with a save (revision, completeness) and with a refusal (read-only, missing).
    onSettled: (_result, _error, variables) =>
      cache.invalidateQueries({ queryKey: documentTreeKeys.tree(variables.specId), exact: true }),
  });
  const { mutateAsync } = mutation;

  const save = useCallback(
    async (
      documentId?: string,
      options?: { resume?: boolean },
    ): Promise<SaveResult | undefined> => {
      const { specId: openSpec, document: open, draft: openDraft } = current.current;
      const id = documentId ?? open?.id;
      if (id === undefined) return undefined;
      // The store is authoritative, including after a previous save updated the revision.
      // Only the shown document may fall back to a draft derived from its loaded record.
      const source = store.get(openSpec, id) ?? (id === open?.id ? openDraft : undefined);
      if (!source) return undefined;
      const key = documentDraftKey(openSpec, id);
      const joined = inFlight.current.get(key);
      if (joined) return joined;
      // A save without a final result is sent again exactly as it was: Resume always replays the
      // written one; otherwise only while it still describes the draft.
      const kept = options?.resume ? retained.current.get(key) : retainedFor(openSpec, id);
      const variables: SaveVariables = kept?.variables ?? {
        specId: openSpec,
        documentId: id,
        content: source.content,
        expectedRevision: source.revision,
        operationId: newId(),
        incarnation: store.incarnation(openSpec, id),
      };
      const base = {
        specId: variables.specId,
        documentId: variables.documentId,
        content: variables.content,
      };
      if (!isDraftDirty(source) && !(options?.resume && kept)) return { ok: true, ...base };
      const run = (async (): Promise<SaveResult> => {
        setErrors((all) => {
          const rest = { ...all };
          delete rest[key];
          return rest;
        });
        setPending((keys) => [...keys, key]);
        try {
          const result = await mutateAsync(variables);
          retained.current.delete(key);
          return { ok: true, ...base, committed: result.committed };
        } catch (error) {
          // Kept for an exact replay: written but not committed, or no answer at all.
          if (apiErrorCode(error) === recoveryCode)
            retained.current.set(key, { variables, reason: 'recovery' });
          else if (writeOutcomeUnknown(error))
            retained.current.set(key, { variables, reason: 'unknown' });
          else retained.current.delete(key);
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
    [mutateAsync, store, retainedFor],
  );

  const saveAll = useCallback(
    async (ids: readonly string[]): Promise<SaveAllResult> => {
      const outcome: SaveAllResult = { saved: [], failed: [], skipped: [] };
      for (const id of new Set(ids)) {
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

  const clearError = useCallback(
    (id: string) =>
      setErrors((all) => {
        const errorKey = documentDraftKey(specId, id);
        if (!(errorKey in all)) return all;
        const rest = { ...all };
        delete rest[errorKey];
        return rest;
      }),
    [specId],
  );

  const follow = useCallback(
    (from: string, to: string) => {
      const fromKey = documentDraftKey(specId, from);
      const toKey = documentDraftKey(specId, to);
      const kept = retained.current.get(fromKey);
      if (kept) {
        retained.current.delete(fromKey);
        retained.current.set(toKey, {
          ...kept,
          variables: {
            ...kept.variables,
            documentId: to,
            incarnation: store.incarnation(specId, to),
          },
        });
      }
      setErrors((all) => {
        if (!(fromKey in all)) return all;
        const { [fromKey]: error, ...rest } = all;
        return { ...rest, [toKey]: error };
      });
    },
    [specId, store],
  );

  const pendingOf = useCallback(
    (id: string): 'saving' | 'recovery' | undefined => {
      const pendingKey = documentDraftKey(specId, id);
      if (inFlight.current.has(pendingKey)) return 'saving';
      return retainedFor(specId, id)?.reason === 'recovery' ? 'recovery' : undefined;
    },
    [specId, retainedFor],
  );

  const key = document ? documentDraftKey(specId, document.id) : undefined;
  return {
    follow,
    pendingOf,
    save,
    saveAll,
    savingOf,
    errorOf,
    clearError,
    saving: key !== undefined && pending.includes(key),
    saveError: key === undefined ? undefined : errors[key],
  };
}
