import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
const catalogue: DemoCatalogue = {
  revision: 'demo-creation-5',
  defaultArchetypeId: 'feature',
  demo: true,
  project: { id: 'demo-project', title: 'Nevo SpecFlow · Demo' },
  currentLocation: {
    kind: 'current',
    path: '/demo/nevo-specflow',
    branch: 'main',
    simulated: false,
  },
  archetypes: [
    {
      id: 'empty',
      version: '1',
      title: 'Empty',
      description: 'Rozpocznij od pustej specyfikacji i dodawaj dokumenty w miarę potrzeb.',
      documents: [],
    },
    {
      id: 'simple',
      version: '1',
      title: 'Specification',
      description: 'Opisz cel i kryteria akceptacji w jednym dokumencie specyfikacji.',
      documents: [
        {
          id: 'specification',
          title: 'Specification',
          filename: 'specification.md',
          required: true,
          content:
            '# Specification\n\n## Goal\n\nDescribe the outcome.\n\n## Acceptance criteria\n\n- ',
        },
      ],
    },
    {
      id: 'feature',
      version: '2',
      title: 'Feature',
      description:
        'Doprecyzuj zmianę produktu w specyfikacji, z możliwością zapisania decyzji i wyników rozpoznania.',
      documents: [
        {
          id: 'specification',
          title: 'Specification',
          filename: 'specification.md',
          required: true,
          content:
            '# Feature\n\n## Problem\n\nOpisz problem użytkownika i cel zmiany.\n\n## Proposed behaviour\n\nOpisz oczekiwane zachowanie produktu.\n\n## Acceptance criteria\n\n- Dodaj sprawdzalne kryteria akceptacji.\n\n## Poza zakresem\n\nOkreśl ograniczenia tej zmiany.\n\n## Sytuacje wyjątkowe\n\nOpisz błędy i sposoby odzyskania poprawnego stanu.\n\n## Otwarte pytania\n\nZapisz kwestie wymagające decyzji.',
        },
        {
          id: 'decisions',
          title: 'Decisions',
          filename: 'decisions.md',
          required: false,
          content:
            '# Decyzje\n\n## Kontekst\n\nOpisz problem wymagający decyzji.\n\n## Rozważone warianty\n\nZapisz opcje i ich ograniczenia.\n\n## Decyzja\n\nZapisz wybrany wariant oraz uzasadnienie.\n\n## Konsekwencje\n\nOpisz skutki i dalsze działania.',
        },
        {
          id: 'research',
          title: 'Research',
          filename: 'research.md',
          required: false,
          content:
            '# Rozpoznanie\n\n## Do sprawdzenia\n\n- Zapisz pytania i źródła.\n\n## Ustalenia\n\nZapisz wyniki rozpoznania.',
        },
      ],
    },
  ],
  providers: [
    {
      id: 'codex',
      title: 'Codex',
      mark: 'codex',
      version: 'Demo adapter v1',
      access: 'Demo fixture',
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
      available: true,
      models: [
        {
          id: 'model-a',
          title: 'Model A · demo',
          efforts: ['low', 'high'],
          modes: ['ask', 'edit', 'agent'],
        },
        {
          id: 'model-b',
          title: 'Model B · demo',
          efforts: [],
          modes: ['ask', 'edit'],
        },
      ],
    },
    {
      id: 'local',
      title: 'Local adapter',
      mark: 'neutral',
      version: 'Demo adapter',
      access: 'Unknown',
      available: false,
      reason: 'Niedostępny w tym środowisku demonstracyjnym.',
      models: [],
    },
  ],
};

// This fixture describes authoring phases; it does not execute a workflow.
export const creationCatalogue: DemoCatalogue = {
  ...catalogue,
  archetypes: catalogue.archetypes.map((archetype) => ({
    ...archetype,
    workflow: {
      phases: archetype.id === 'empty' ? [] : ['Doprecyzowanie', 'Opracowanie', 'Weryfikacja'],
      requiredDocuments: archetype.documents
        .filter((document) => document.required)
        .map((document) => document.filename),
      suggestedDocuments: archetype.documents
        .filter((document) => !document.required)
        .map((document) => document.filename),
    },
  })),
  providers: catalogue.providers.map((provider) => ({
    ...provider,
    connection: 'unknown',
    profile: 'Profil demonstracyjny',
    quota: { state: 'unknown' },
  })),
};
