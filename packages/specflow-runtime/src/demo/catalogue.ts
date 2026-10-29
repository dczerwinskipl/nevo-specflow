import type { ArchetypeDefinition, TemplateDefinition } from '@nevo/specflow-contracts/documents';
import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import {
  resolveCatalogue,
  toArchetypeCatalogue,
  type ResolvedCatalogue,
} from '@nevo/specflow-engine';
import { seedArchetypes, seedDocumentTypes } from './definitions';

function seedTemplate(archetypeId: string, templateId: string): TemplateDefinition {
  const template = seedArchetypes
    .find((archetype) => archetype.id === archetypeId)
    ?.templates.find((candidate) => candidate.id === templateId);
  if (!template) throw new Error(`Seed template ${archetypeId}/${templateId} is missing.`);
  return template;
}

/**
 * Demo-only owner archetype, declared like a project's own definition would be. Its requirement
 * on `decisions` lets the demo show an unmet requirement; its templates are the seeds' ones.
 */
const crossModule: ArchetypeDefinition = {
  id: 'cross-module',
  version: 1,
  title: 'Cross-module change (demo)',
  description:
    'Demo-only owner archetype: a change that spans several modules and must record its decisions.',
  useWhen:
    'Demo only: shows an archetype defined by a project owner whose requirements go beyond the overview.',
  instructions:
    'Record every decision that affects more than one module in the decisions document before the implementation starts. Describe the structure in the architecture document when it changes.',
  requirements: [
    { documentType: 'overview', minCount: 1 },
    { documentType: 'decisions', minCount: 1 },
  ],
  templates: [
    seedTemplate('minimal', 'overview'),
    { ...seedTemplate('architecture', 'decisions'), include: 'optional', preselected: true },
    { ...seedTemplate('architecture', 'architecture'), include: 'optional', preselected: false },
  ],
};

/**
 * The demo archetype catalogue: what a project gets from `definitions install` (the three seed
 * archetypes and their document types, see `./definitions`) plus the demo-only owner archetype,
 * resolved by the Engine's own resolver. Create scaffolds from it.
 */
export const demoArchetypes: ResolvedCatalogue = resolveCatalogue({
  documentTypes: seedDocumentTypes,
  archetypes: [...seedArchetypes, crossModule],
});

/**
 * `GET /api/demo/specification-creation`: the real `ArchetypeCatalogue` of {@link demoArchetypes}
 * plus the demo-only part (project, simulated location, providers).
 */
export const creationCatalogue: DemoCatalogue = {
  ...toArchetypeCatalogue({ catalogue: demoArchetypes }),
  defaultArchetypeId: 'feature',
  demo: true,
  project: { id: 'demo-project', title: 'Nevo SpecFlow · Demo' },
  currentLocation: {
    kind: 'current',
    path: '/demo/nevo-specflow',
    branch: 'main',
    simulated: false,
  },
  providers: [
    {
      id: 'codex',
      title: 'Codex',
      mark: 'codex',
      version: 'Demo adapter v1',
      access: 'Demo fixture',
      connection: 'unknown',
      profile: 'Profil demonstracyjny',
      quota: { state: 'unknown' },
      available: true,
      models: [
        {
          id: 'model-a',
          title: 'Model A · demo',
          efforts: ['low', 'medium', 'high'],
          modes: ['ask', 'edit', 'agent'],
        },
        { id: 'model-b', title: 'Model B · demo', efforts: [], modes: ['ask', 'agent'] },
      ],
    },
    {
      id: 'claude',
      title: 'Claude',
      mark: 'claude',
      version: 'Demo adapter v1',
      access: 'Demo fixture',
      connection: 'unknown',
      profile: 'Profil demonstracyjny',
      quota: { state: 'unknown' },
      available: true,
      models: [
        {
          id: 'model-a',
          title: 'Model A · demo',
          efforts: ['low', 'high'],
          modes: ['ask', 'edit', 'agent'],
        },
        { id: 'model-b', title: 'Model B · demo', efforts: [], modes: ['ask', 'edit'] },
      ],
    },
    {
      id: 'local',
      title: 'Local adapter',
      mark: 'neutral',
      version: 'Demo adapter',
      access: 'Unknown',
      connection: 'unknown',
      profile: 'Profil demonstracyjny',
      quota: { state: 'unknown' },
      available: false,
      reason: 'Niedostępny w tym środowisku demonstracyjnym.',
      models: [],
    },
  ],
};
