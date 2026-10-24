import type { ArchetypeCatalogue, ArchetypeInfo } from '@nevo/specflow-contracts/documents';
import { describe, expect, it } from 'vitest';
import {
  archetypeSelection,
  chooseArchetype,
  documentsToCreate,
  initialArchetypeChoice,
  refreshedArchetypeChoice,
  selectedArchetype,
  tickedTemplates,
  toggleTemplate,
  unmetWhenUnticked,
} from './archetypeChoice';

const template = (
  id: string,
  include: 'always' | 'optional',
  preselected?: boolean,
  type = id,
) => ({
  id,
  type,
  title: id,
  filename: `${id}.md`,
  include,
  ...(preselected === undefined ? {} : { preselected }),
  content: '',
});

const archetype = (
  id: string,
  documents: ArchetypeInfo['documents'],
  requirements: ArchetypeInfo['requirements'] = [{ documentType: 'overview', minCount: 1 }],
): ArchetypeInfo => ({
  id,
  version: 2,
  title: id,
  description: 'd',
  useWhen: 'u',
  requirements,
  documents,
});

const minimal = archetype('minimal', [template('overview', 'always')]);
const feature = archetype('feature', [
  template('overview', 'always'),
  template('behaviour', 'optional', true),
  template('ux', 'optional', true),
  template('story', 'optional', false),
]);
const team = archetype(
  'team',
  [template('overview', 'always'), template('decisions', 'optional', true)],
  [
    { documentType: 'overview', minCount: 1 },
    { documentType: 'decisions', minCount: 1 },
  ],
);
const catalogue = (defaultArchetypeId?: string): ArchetypeCatalogue => ({
  revision: 'rev',
  documentTypes: [],
  archetypes: [minimal, feature, team],
  ...(defaultArchetypeId ? { defaultArchetypeId } : {}),
});

describe('archetype choice', () => {
  it('starts on the catalogue default, else on the first archetype', () => {
    expect(selectedArchetype(catalogue('feature'), initialArchetypeChoice)?.id).toBe('feature');
    expect(selectedArchetype(catalogue(), initialArchetypeChoice)?.id).toBe('minimal');
    expect(selectedArchetype(catalogue('gone'), initialArchetypeChoice)?.id).toBe('minimal');
    // A chosen archetype that the catalogue no longer has falls back to the default.
    expect(selectedArchetype(catalogue('feature'), { archetypeId: 'gone', ticks: {} })?.id).toBe(
      'feature',
    );
  });

  it('ticks the preselected suggestions and keeps the ticks per archetype within the visit', () => {
    let choice = chooseArchetype(initialArchetypeChoice, 'feature');
    expect(tickedTemplates(feature, choice)).toEqual(['behaviour', 'ux']);
    choice = toggleTemplate(choice, feature, 'ux', false);
    choice = toggleTemplate(choice, feature, 'story', true);
    expect(tickedTemplates(feature, choice)).toEqual(['behaviour', 'story']);
    choice = chooseArchetype(choice, 'team');
    expect(tickedTemplates(team, choice)).toEqual(['decisions']);
    choice = chooseArchetype(choice, 'feature');
    expect(tickedTemplates(feature, choice)).toEqual(['behaviour', 'story']);
  });

  it('lists the files Create makes and the request part', () => {
    const choice = chooseArchetype(initialArchetypeChoice, 'feature');
    expect(documentsToCreate(feature, choice)).toEqual(['overview.md', 'behaviour.md', 'ux.md']);
    expect(archetypeSelection(catalogue(), feature, choice)).toEqual({
      archetypeId: 'feature',
      archetypeVersion: 2,
      catalogueRevision: 'rev',
      optionalDocumentIds: ['behaviour', 'ux'],
    });
  });

  it('warns only when unticking leaves a requirement of the archetype unmet', () => {
    const decisions = team.documents[1]!;
    expect(unmetWhenUnticked(team, decisions, ['decisions'])).toBe(false);
    expect(unmetWhenUnticked(team, decisions, [])).toBe(true);
    expect(unmetWhenUnticked(feature, feature.documents[1]!, [])).toBe(false);
  });

  it('after a stale catalogue keeps the archetype with new default ticks; after an unknown one falls back', () => {
    const choice = toggleTemplate(
      chooseArchetype(initialArchetypeChoice, 'feature'),
      feature,
      'ux',
      false,
    );
    expect(refreshedArchetypeChoice(choice, 'CATALOGUE_STALE')).toEqual({
      archetypeId: 'feature',
      ticks: {},
    });
    expect(refreshedArchetypeChoice(choice, 'ARCHETYPE_UNKNOWN')).toEqual({ ticks: {} });
  });
});
