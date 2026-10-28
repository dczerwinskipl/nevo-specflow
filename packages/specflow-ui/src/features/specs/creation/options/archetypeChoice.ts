import type {
  ArchetypeCatalogue,
  ArchetypeInfo,
  ArchetypeTemplateInfo,
  CreateArchetypeSelection,
} from '@nevo/specflow-contracts/documents';

/**
 * The archetype part of the Create form: the chosen archetype and, per archetype visited, the
 * optional templates the user ticked. Ticks are kept per archetype within the visit, so switching
 * back restores the user's ticks; an archetype not visited yet starts from its preselected ones.
 */
export interface ArchetypeChoice {
  /** The chosen archetype; undefined means the initial one, if any (see `selectedArchetype`). */
  readonly archetypeId?: string;
  /** Ticked optional template ids, by archetype id (only archetypes the user changed). */
  readonly ticks: Readonly<Record<string, readonly string[]>>;
}

export const initialArchetypeChoice: ArchetypeChoice = { ticks: {} };

/**
 * The archetype selected before the user chooses (decision Q1): the catalogue's
 * `defaultArchetypeId` when it names an archetype, else the only archetype of a catalogue with
 * one, else none. Catalogue order carries no preference (the real catalogue is sorted by id).
 */
export function defaultArchetype(catalogue: ArchetypeCatalogue): ArchetypeInfo | undefined {
  return (
    catalogue.archetypes.find((archetype) => archetype.id === catalogue.defaultArchetypeId) ??
    (catalogue.archetypes.length === 1 ? catalogue.archetypes[0] : undefined)
  );
}

/**
 * The archetype on screen: the chosen one while the catalogue has it, else the initial one (which
 * may be none: the form then asks the user to choose).
 */
export function selectedArchetype(
  catalogue: ArchetypeCatalogue | undefined,
  choice: ArchetypeChoice,
): ArchetypeInfo | undefined {
  if (!catalogue) return undefined;
  return (
    catalogue.archetypes.find((archetype) => archetype.id === choice.archetypeId) ??
    defaultArchetype(catalogue)
  );
}

export const optionalTemplates = (archetype: ArchetypeInfo) =>
  archetype.documents.filter((template) => template.include === 'optional');
export const alwaysTemplates = (archetype: ArchetypeInfo) =>
  archetype.documents.filter((template) => template.include === 'always');

/** The ticked optional templates of an archetype (its preselected ones until the user changes them). */
export function tickedTemplates(archetype: ArchetypeInfo, choice: ArchetypeChoice): string[] {
  const own = choice.ticks[archetype.id];
  const ids = optionalTemplates(archetype).map((template) => template.id);
  return own
    ? ids.filter((id) => own.includes(id))
    : optionalTemplates(archetype)
        .filter((template) => template.preselected === true)
        .map((template) => template.id);
}

export function chooseArchetype(choice: ArchetypeChoice, archetypeId: string): ArchetypeChoice {
  return { ...choice, archetypeId };
}

export function toggleTemplate(
  choice: ArchetypeChoice,
  archetype: ArchetypeInfo,
  templateId: string,
  ticked: boolean,
): ArchetypeChoice {
  const current = tickedTemplates(archetype, choice).filter((id) => id !== templateId);
  return {
    ...choice,
    archetypeId: archetype.id,
    ticks: { ...choice.ticks, [archetype.id]: ticked ? [...current, templateId] : current },
  };
}

/**
 * Unticking this template leaves a requirement of the archetype unmet (only owner-configured
 * archetypes do this): the `always` templates and the other ticked templates of its type are
 * fewer than the requirement's `minCount`.
 */
export function unmetWhenUnticked(
  archetype: ArchetypeInfo,
  template: ArchetypeTemplateInfo,
  ticked: readonly string[],
): boolean {
  const minCount = Math.max(
    0,
    ...archetype.requirements
      .filter((requirement) => requirement.documentType === template.type)
      .map((requirement) => requirement.minCount),
  );
  if (minCount === 0 || ticked.includes(template.id)) return false;
  const created = archetype.documents.filter(
    (other) =>
      other.id !== template.id &&
      other.type === template.type &&
      (other.include === 'always' || ticked.includes(other.id)),
  ).length;
  return created < minCount;
}

/** The file names Create makes: the `always` templates, then the ticked optional ones. */
export function documentsToCreate(archetype: ArchetypeInfo, choice: ArchetypeChoice): string[] {
  const ticked = tickedTemplates(archetype, choice);
  return [
    ...alwaysTemplates(archetype).map((template) => template.filename),
    ...optionalTemplates(archetype)
      .filter((template) => ticked.includes(template.id))
      .map((template) => template.filename),
  ];
}

/** The archetype part of the Create request. */
export function archetypeSelection(
  catalogue: ArchetypeCatalogue,
  archetype: ArchetypeInfo,
  choice: ArchetypeChoice,
): Pick<
  CreateArchetypeSelection,
  'archetypeId' | 'archetypeVersion' | 'catalogueRevision' | 'optionalDocumentIds'
> {
  return {
    archetypeId: archetype.id,
    archetypeVersion: archetype.version,
    catalogueRevision: catalogue.revision,
    optionalDocumentIds: tickedTemplates(archetype, choice),
  };
}

/**
 * After the catalogue changed under the form (`CATALOGUE_STALE`): the selected archetype stays
 * when it still exists, every tick returns to the new defaults. After `ARCHETYPE_UNKNOWN` the
 * selection falls back to the initial rule (the default, the only archetype, or none).
 */
export function refreshedArchetypeChoice(
  choice: ArchetypeChoice,
  code: 'CATALOGUE_STALE' | 'ARCHETYPE_UNKNOWN',
): ArchetypeChoice {
  return code === 'ARCHETYPE_UNKNOWN'
    ? { ticks: {} }
    : { archetypeId: choice.archetypeId, ticks: {} };
}
