import type { CreateOptionsModel } from './useCreateOptions';
import { WorkspacePlaceSection } from './workspace/WorkspacePlaceSection';
import type { WorkspacePlace } from './workspace/useWorkspacePlace';

/**
 * The "where does it live" section of a Create form, wired to the form's options and place choice.
 * Both flows (project and demo) show it the same way; only the owner differs in what it does with
 * the choice.
 */
export function CreateWorkspaceSection({
  createOptions,
  place,
  locked,
  title,
  headingId,
  onRefresh,
  onAnnounce,
}: {
  createOptions: CreateOptionsModel;
  place: WorkspacePlace;
  locked: boolean;
  /** The specification name (the generated slug and branch preview derive from it). */
  title: string;
  headingId: string;
  onRefresh: () => void;
  onAnnounce: (message: string) => void;
}) {
  return (
    <WorkspacePlaceSection
      headingId={headingId}
      state={createOptions.state}
      refreshing={createOptions.fetching && Boolean(createOptions.options)}
      refreshFailed={createOptions.refreshFailed}
      choice={place.choice}
      update={place.setChoice}
      locked={locked}
      onRefresh={onRefresh}
      onAnnounce={onAnnounce}
      title={title}
      conflicts={place.conflicts}
      handleRef={place.handleRef}
    />
  );
}
