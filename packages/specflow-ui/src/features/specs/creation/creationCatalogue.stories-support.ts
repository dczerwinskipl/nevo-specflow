import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
export const catalogue: DemoCatalogue = {
  revision: 'owner-v4-story',
  defaultArchetypeId: 'feature',
  demo: true,
  project: { id: 'demo', title: 'Projekt demonstracyjny' },
  currentLocation: { kind: 'current', path: '/demo/project', branch: 'main', simulated: false },
  archetypes: [
    {
      id: 'feature',
      version: '2',
      title: 'Feature',
      description: 'Przygotowanie i weryfikacja zmiany zachowania produktu.',
      workflow: {
        phases: ['Doprecyzowanie', 'Opracowanie', 'Weryfikacja'],
        requiredDocuments: ['specification.md'],
        suggestedDocuments: ['decisions.md', 'research.md'],
      },
      documents: [
        {
          id: 'specification',
          title: 'Specification',
          filename: 'specification.md',
          required: true,
          content: '# Feature: Logowanie SSO',
        },
        {
          id: 'decisions',
          title: 'Decisions',
          filename: 'decisions.md',
          required: false,
          content: '# Decyzje',
        },
        {
          id: 'research',
          title: 'Research',
          filename: 'research.md',
          required: false,
          content: '# Badania',
        },
      ],
    },
    {
      id: 'empty',
      version: '1',
      title: 'Empty',
      description: 'Bez początkowych plików',
      documents: [],
    },
  ],
  providers: ['codex', 'claude'].map((id) => ({
    id,
    title: id === 'codex' ? 'Codex' : 'Claude',
    mark: id as 'codex' | 'claude',
    version: 'Demo',
    access: 'Dane demonstracyjne',
    profile: 'Profil demonstracyjny',
    connection: 'unknown',
    quota: { state: 'unknown' },
    available: true,
    models: [
      {
        id: 'model-a',
        title: `${id} model A`,
        efforts: ['low', 'high'],
        modes: ['ask', 'edit', 'agent'],
      },
      {
        id: 'model-b',
        title: `${id} model B`,
        efforts: [],
        modes: id === 'codex' ? ['ask', 'agent'] : ['ask', 'edit'],
      },
    ],
  })),
};
