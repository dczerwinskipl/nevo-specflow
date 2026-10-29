import { useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { CreateFailure } from '../errors/createFailure';
import type { CreateOptionsModel } from '../options/useCreateOptions';
import type { WorkspacePlaceSectionHandle } from './WorkspacePlaceSection';
import { initialWorkspaceChoice, type WorkspaceChoice } from './model/workspaceChoice';
import { conflictsOfFailure, type WorkspaceConflicts } from './model/workspaceConflicts';
import { revalidate } from './model/workspaceValidation';

export interface WorkspacePlace {
  choice: WorkspaceChoice;
  setChoice: React.Dispatch<React.SetStateAction<WorkspaceChoice>>;
  /** What the server refused about the typed branch or slug. */
  conflicts: WorkspaceConflicts;
  handleRef: RefObject<WorkspacePlaceSectionHandle | null>;
  /**
   * Called with a definite failure just before it is published: a refused typed branch or slug is
   * flagged at its field (the settings open, the field takes focus), the form is kept.
   */
  reportFailure: (failure: CreateFailure, sent: { slug?: string }) => void;
  /** The alert offered "use an automatic name": forget the typed branch. */
  chooseAutomaticBranch: () => void;
  /** The alert offered "use your own name": open the field and focus it. */
  chooseCustomBranch: () => void;
  /**
   * Re-reads the options and announces the result. A failure that described the old options is
   * dismissed; the refreshed ones are then validated field by field and focus continues at the
   * first flagged field, else at `fallbackFocus`.
   */
  refresh: (input: {
    failure: CreateFailure | null | undefined;
    dismissFailure: () => void;
    fallbackFocus: () => void;
  }) => Promise<void>;
}

/**
 * The "where to work" choice of a Create form: the owner-held choice, what the server refused about
 * the typed fields, and the actions that connect them to the failure alert and the options refresh.
 */
export function useWorkspacePlace(
  createOptions: CreateOptionsModel,
  announce: (message: string) => void,
  /** The form came back from the progress page: its choice, and the refusal to flag at a field. */
  initial?: { choice: WorkspaceChoice; failure?: CreateFailure },
): WorkspacePlace {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<WorkspaceChoice>(
    () => initial?.choice ?? initialWorkspaceChoice,
  );
  const [conflicts, setConflicts] = useState<WorkspaceConflicts>(() => {
    if (!initial?.failure) {
      return {};
    }

    const { choice: restored } = initial;
    const slug = restored.slug.on && restored.slug.edited ? restored.slug.value : undefined;

    return conflictsOfFailure(initial.failure, { slug, branch: restored.branch.name.trim() }) ?? {};
  });
  const handleRef = useRef<WorkspacePlaceSectionHandle>(null);

  // Back from the progress page with a refused field: the section (and its field) exists only once
  // the options are there, so focus is handed over then, once.
  const pendingFocus = useRef<'branch' | 'slug' | undefined>(
    conflicts.slug ? 'slug' : conflicts.branch ? 'branch' : undefined,
  );
  const optionsReady = createOptions.state.status === 'ready';
  useEffect(() => {
    if (!optionsReady || !pendingFocus.current) {
      return;
    }

    const field = pendingFocus.current;
    pendingFocus.current = undefined;
    handleRef.current?.focusField(field);
  }, [optionsReady]);

  return {
    choice,
    setChoice,
    conflicts,
    handleRef,
    reportFailure(failure, sent) {
      const change = conflictsOfFailure(failure, {
        slug: sent.slug,
        branch: choice.branch.name.trim(),
      });
      if (!change) {
        return;
      }

      setConflicts((current) => ({ ...current, ...change }));
      if (change.slug) {
        handleRef.current?.focusField('slug');
      } else if (change.branch) {
        handleRef.current?.focusField('branch');
      }
    },
    chooseAutomaticBranch() {
      setChoice((current) => ({ ...current, branch: initialWorkspaceChoice.branch }));
    },
    chooseCustomBranch() {
      setChoice((current) => ({
        ...current,
        branch: current.branch.on ? current.branch : { on: true, name: '', edited: false },
      }));
      handleRef.current?.focusField('branch');
    },
    async refresh({ failure, dismissFailure, fallbackFocus }) {
      const result = await createOptions.refresh();
      if (!result) {
        return;
      }

      if (result.kind === 'failed') {
        announce(t('create.announce.refreshFailed'));

        return;
      }

      const stale = Object.keys(revalidate(choice, result.options)).length > 0;
      announce(stale ? t('create.announce.refreshedStale') : t('create.announce.refreshed'));
      if (
        failure?.kind === 'stale' ||
        failure?.kind === 'name-conflict' ||
        (failure?.kind === 'branch-protected' && failure.cause === 'workspace')
      ) {
        dismissFailure();
        // The alert that held focus is gone after this render.
        handleRef.current?.focusFirstInvalid(fallbackFocus);
      }
    },
  };
}
