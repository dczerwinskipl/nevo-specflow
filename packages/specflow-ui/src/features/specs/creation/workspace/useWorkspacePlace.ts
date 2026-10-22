import { useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { CreateFailure } from '../createFailure';
import type { CreateOptionsModel } from '../useCreateOptions';
import type { WorkspacePlaceSectionHandle } from './WorkspacePlaceSection';
import { initialWorkspaceChoice, type WorkspaceChoice } from './workspaceChoice';
import type { WorkspaceConflicts } from './workspaceConflicts';
import { revalidate } from './workspaceValidation';

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
): WorkspacePlace {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<WorkspaceChoice>(initialWorkspaceChoice);
  const [conflicts, setConflicts] = useState<WorkspaceConflicts>({});
  const handleRef = useRef<WorkspacePlaceSectionHandle>(null);

  return {
    choice,
    setChoice,
    conflicts,
    handleRef,
    reportFailure(failure, sent) {
      if (failure.kind === 'name-conflict') {
        // A slug the owner typed may be the taken name: say so at the field, keep the form.
        if (!sent.slug) return;
        const value = sent.slug;
        setConflicts((current) => ({ ...current, slug: { value } }));
        handleRef.current?.focusField('slug');
        return;
      }
      if (failure.kind === 'branch-exists' && failure.automatic) {
        setConflicts((current) => ({ ...current, branch: undefined }));
        return;
      }
      if (failure.kind !== 'branch-exists' && failure.kind !== 'branch-invalid') return;
      const value = choice.branch.name.trim();
      const reason = failure.kind === 'branch-invalid' ? 'invalid' : 'exists';
      setConflicts((current) => ({ ...current, branch: { value, reason } }));
      handleRef.current?.focusField('branch');
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
      if (!result) return;
      if (result.kind === 'failed') {
        announce(t('create.announce.refreshFailed'));
        return;
      }
      const stale = Object.keys(revalidate(choice, result.options)).length > 0;
      announce(stale ? t('create.announce.refreshedStale') : t('create.announce.refreshed'));
      if (failure?.kind === 'stale' || failure?.kind === 'name-conflict') {
        dismissFailure();
        // The alert that held focus is gone after this render.
        handleRef.current?.focusFirstInvalid(fallbackFocus);
      }
    },
  };
}
