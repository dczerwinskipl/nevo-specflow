import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
export const catalogue: DemoCatalogue = {
  revision: 'owner-v4-story',
  defaultArchetypeId: 'feature',
  demo: true,
  project: { id: 'demo', title: 'Projekt demonstracyjny' },
  currentLocation: { kind: 'current', path: '/demo/project', branch: 'main', simulated: false },
  documentTypes: [
    {
      id: 'overview',
      title: 'Overview',
      description: 'Entry point of the Specification.',
      useWhen: 'Always.',
      instructions: 'Write this first and keep it current.',
      defaultFilename: 'overview.md',
    },
    {
      id: 'decisions',
      title: 'Decisions',
      description: 'Recorded decisions.',
      useWhen: 'A choice with lasting consequences was made.',
      instructions: 'One decision per section.',
      defaultFilename: 'decisions.md',
    },
    {
      id: 'research',
      title: 'Research',
      description: 'Findings and evidence.',
      useWhen: 'Facts must be established first.',
      instructions: 'Every finding cites a source.',
      defaultFilename: 'research.md',
    },
  ],
  archetypes: [
    {
      id: 'feature',
      version: 1,
      title: 'Feature',
      description: 'Przygotowanie i weryfikacja zmiany zachowania produktu.',
      useWhen: 'Zmiana zachowania produktu.',
      requirements: [{ documentType: 'overview', minCount: 1 }],
      documents: [
        {
          id: 'overview',
          type: 'overview',
          title: 'Overview',
          filename: 'overview.md',
          include: 'always',
          content: '# Feature: Logowanie SSO',
        },
        {
          id: 'decisions',
          type: 'decisions',
          title: 'Decisions',
          filename: 'decisions.md',
          include: 'optional',
          preselected: true,
          content: '# Decyzje',
        },
        {
          id: 'research',
          type: 'research',
          title: 'Research',
          filename: 'research.md',
          include: 'optional',
          content: '# Badania',
        },
      ],
    },
    {
      id: 'minimal',
      version: 1,
      title: 'Minimal',
      description: 'Tylko przegląd',
      useWhen: 'Mała zmiana.',
      requirements: [{ documentType: 'overview', minCount: 1 }],
      documents: [
        {
          id: 'overview',
          type: 'overview',
          title: 'Overview',
          filename: 'overview.md',
          include: 'always',
          content: '# Minimal',
        },
      ],
    },
  ],
  // Each provider's own work-mode vocabulary (the Runtime is the source of truth): Codex offers
  // Ask/Edit/Agent, Claude its native Plan/Accept edits/Auto. Ids are opaque to the UI.
  providers: (['codex', 'claude'] as const).map((id) => ({
    id,
    title: id === 'codex' ? 'Codex' : 'Claude',
    mark: id,
    version: 'Demo',
    access: 'Dane demonstracyjne',
    profile: 'Profil demonstracyjny',
    connection: 'unknown',
    quota: { state: 'unknown' },
    available: true,
    modes:
      id === 'codex'
        ? [
            { id: 'ask', title: 'Ask' },
            { id: 'edit', title: 'Edit' },
            { id: 'agent', title: 'Agent' },
          ]
        : [
            { id: 'plan', title: 'Plan' },
            { id: 'acceptEdits', title: 'Accept edits' },
            { id: 'auto', title: 'Auto' },
          ],
    defaultModeId: id === 'codex' ? 'agent' : 'acceptEdits',
    models: [
      {
        id: 'model-a',
        title: `${id} model A`,
        efforts: ['low', 'high'],
        modes: id === 'codex' ? ['ask', 'edit', 'agent'] : ['plan', 'acceptEdits', 'auto'],
      },
      {
        id: 'model-b',
        title: `${id} model B`,
        efforts: [],
        modes: id === 'codex' ? ['ask', 'agent'] : ['plan', 'acceptEdits'],
      },
    ],
  })),
};
