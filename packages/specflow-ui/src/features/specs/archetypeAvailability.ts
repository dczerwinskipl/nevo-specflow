import type { ArchetypeCatalogue } from '@nevo/specflow-contracts/documents';
import { message, type Message } from '../../i18n/message';

/** Present the Engine's usable catalogue and diagnostics; never validate definitions in the UI. */
export function archetypeAvailabilityProblem(
  catalogue: ArchetypeCatalogue | undefined,
): Message | undefined {
  if (!catalogue || catalogue.archetypes.length > 0) {
    return undefined;
  }

  return message(
    catalogue.problems?.some((problem) => problem.severity === 'error')
      ? 'create.prerequisite.invalidArchetypes'
      : 'create.prerequisite.noArchetypes',
  );
}
