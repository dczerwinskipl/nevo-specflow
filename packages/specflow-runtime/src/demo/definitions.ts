import type {
  ArchetypeDefinition,
  DocumentTypeDefinition,
} from '@nevo/specflow-contracts/documents';

/*
 * The definitions `nevo-specflow definitions install` writes into a project, copied from the
 * Engine's seeds (`packages/specflow-engine/definitions`) so the demo catalogue uses the product's
 * own texts and templates. `definitions.test.ts` fails when the seeds change and this copy does not.
 * Generated; edit the seeds, not this file.
 */

export const seedDocumentTypes: readonly DocumentTypeDefinition[] = [
  {
    id: 'architecture',
    title: 'Architecture',
    description:
      'Structural analysis: boundaries, options considered, constraints and the chosen structure.',
    useWhen: 'The work reshapes modules, ownership or dependencies, or answers a design question.',
    instructions:
      'Describe the structure: the problem, the boundaries and owners involved, the options considered with their trade-offs, the chosen structure and the constraints it imposes. Make dependencies and the direction of change explicit.',
    defaultFilename: 'architecture.md',
  },
  {
    id: 'backend',
    title: 'Backend',
    description:
      'Server-side design: contracts, data and ownership, invariants, error cases, recovery and verification.',
    useWhen: 'The change needs new or changed APIs, persistence, Engine or Runtime behaviour.',
    instructions:
      'Describe the server-side contract: the owning module, data and persistence, API and event shapes (by reference to the authoritative contract), invariants, error codes and recovery, and how each is verified (unit versus integration). Do not describe screens.',
    defaultFilename: 'backend.md',
  },
  {
    id: 'behaviour',
    title: 'Behaviour',
    description:
      'Observable product behaviour: scenarios, rules, edge cases and acceptance scenarios, independent of layout and implementation.',
    useWhen: 'The change alters what the product does for a user or a caller.',
    instructions:
      'Describe what the product does as observable scenarios (given/when/then or short numbered steps), the rules behind them and the edge and failure cases, in the terms of the user or caller. Do not describe screens, layout or implementation. Every acceptance scenario must be verifiable by someone who has not read the code.',
    defaultFilename: 'behaviour.md',
  },
  {
    id: 'decisions',
    title: 'Decisions',
    description: 'Recorded decisions: context, options, decision and consequences.',
    useWhen: 'A choice with lasting consequences was made and should not be rediscovered.',
    instructions:
      'Record each decision as context, the options considered, the decision and its consequences, one decision per section, with who decided and when if known. Record decisions that are costly to rediscover, not routine choices.',
    defaultFilename: 'decisions.md',
  },
  {
    id: 'note',
    title: 'Note',
    description: 'Supporting free-form material that fits no other type.',
    useWhen: 'A file belongs to the Specification but has no more specific type.',
    instructions:
      'Use for supporting material that fits no other type. Start with one sentence saying why the note belongs to this Specification.',
    defaultFilename: 'note.md',
  },
  {
    id: 'overview',
    title: 'Overview',
    description:
      'Entry point of the Specification: context, goal, non-goals, constraints, affected areas, acceptance criteria.',
    useWhen: 'Always. Every Specification has exactly one, and it cannot be deleted.',
    instructions:
      'Write this first and keep it current. State the context and the goal in plain terms, list explicit non-goals and constraints, name the affected areas, and write acceptance criteria that can be checked. Link to the other documents instead of repeating their content. Do not put detailed design here.',
    defaultFilename: 'overview.md',
  },
  {
    id: 'research',
    title: 'Research',
    description:
      'Findings and evidence gathered before or during the work: questions, sources, results.',
    useWhen: 'Facts must be established before a decision or implementation.',
    instructions:
      'Record the questions asked, the sources consulted (with locations) and the findings, separating fact from interpretation. State what remains unknown.',
    defaultFilename: 'research.md',
  },
  {
    id: 'user-story',
    title: 'User story',
    description:
      'One or more user stories (as a ... I want ... so that ...) with their acceptance criteria.',
    useWhen: 'The team works from stories and wants them kept next to the specification.',
    instructions:
      "Write stories as 'As a <role> I want <capability> so that <benefit>', each with acceptance criteria. Keep stories small and independent and link them to the behaviour they imply.",
    defaultFilename: 'user-story.md',
  },
  {
    id: 'ux',
    title: 'UX',
    description:
      'The user-experience contract: flows, screens, states, copy, responsive behaviour and accessibility.',
    useWhen: 'The change has a user-facing interface or alters an existing one.',
    instructions:
      'Describe the user journey: flows, each screen and its states (empty, loading, error, success), the exact copy, responsive behaviour and accessibility. Reference existing patterns and name what is new. Do not restate behaviour rules; link to the behaviour document.',
    defaultFilename: 'ux.md',
  },
];

export const seedArchetypes: readonly ArchetypeDefinition[] = [
  {
    id: 'architecture',
    version: 1,
    title: 'Architecture',
    description:
      'A structural change or design question: an architecture analysis plus recorded decisions, suggested and preselected.',
    useWhen:
      'The work reshapes modules, ownership or dependencies, or answers a design question without a user-facing change.',
    instructions:
      'Start with the overview, state the problem in the architecture document, record each decision in decisions as it is made and use research for evidence. Do not describe user-facing behaviour here; link to a feature Specification if one exists.',
    requirements: [
      {
        documentType: 'overview',
        minCount: 1,
      },
    ],
    templates: [
      {
        id: 'overview',
        documentType: 'overview',
        filename: 'overview.md',
        include: 'always',
        instructions:
          'Fill Context and Goal first; leave a section empty rather than inventing content.',
        content:
          '---\nid: spec.{{slug}}\ntype: change\ntitle: {{specificationTitleJson}}\nstatus: draft\nchange: {{slug}}\n---\n\n# {{specificationTitle}}\n\n## Context\n\n## Goal\n\n<!-- Initial goal captured when this specification was created; refine or rewrite it freely. -->\n\n{{goalOrPrompt}}\n\n## Non-goals\n\n## Constraints\n\n## Affected Areas\n\n## Acceptance Criteria & Verification\n',
      },
      {
        id: 'architecture',
        documentType: 'architecture',
        filename: 'architecture.md',
        include: 'optional',
        preselected: true,
        instructions: 'Give at least two options with trade-offs before the chosen structure.',
        content:
          '# {{specificationTitle}} - Architecture\n\n## Context\n\n## Options considered\n\n## Chosen structure\n\n## Constraints\n',
      },
      {
        id: 'decisions',
        documentType: 'decisions',
        filename: 'decisions.md',
        include: 'optional',
        preselected: true,
        instructions:
          'Add one section block per decision; do not rewrite earlier decisions, supersede them.',
        content:
          '# {{specificationTitle}} - Decisions\n\n## Context\n\n## Options\n\n## Decision\n\n## Consequences\n',
      },
      {
        id: 'research',
        documentType: 'research',
        filename: 'research.md',
        include: 'optional',
        instructions: 'List the questions first; every finding cites a source.',
        content:
          '# {{specificationTitle}} - Research\n\n## Questions\n\n## Sources\n\n## Findings\n',
      },
      {
        id: 'note',
        documentType: 'note',
        filename: 'note.md',
        include: 'optional',
        instructions: 'State why this note belongs here.',
        content: '# {{specificationTitle}} - Note\n',
      },
    ],
  },
  {
    id: 'feature',
    version: 1,
    title: 'Feature',
    description:
      'A full slice of a product capability: observable behaviour, user experience and backend design, in addition to the overview. Behaviour, UX and backend documents are suggested and preselected; user stories are an optional suggestion.',
    useWhen: 'One change spans what the product does, how it looks and how the server supports it.',
    instructions:
      'Start with the overview, then behaviour, then UX, then backend, keeping each to its own concern and linking between them. Add user stories only when the team works from stories. Treat the backend document as the contract that the UI and tests are checked against.',
    requirements: [
      {
        documentType: 'overview',
        minCount: 1,
      },
    ],
    templates: [
      {
        id: 'overview',
        documentType: 'overview',
        filename: 'overview.md',
        include: 'always',
        instructions:
          'Fill Context and Goal first; leave a section empty rather than inventing content.',
        content:
          '---\nid: spec.{{slug}}\ntype: change\ntitle: {{specificationTitleJson}}\nstatus: draft\nchange: {{slug}}\n---\n\n# {{specificationTitle}}\n\n## Context\n\n## Goal\n\n<!-- Initial goal captured when this specification was created; refine or rewrite it freely. -->\n\n{{goalOrPrompt}}\n\n## Non-goals\n\n## Constraints\n\n## Affected Areas\n\n## Acceptance Criteria & Verification\n',
      },
      {
        id: 'behaviour',
        documentType: 'behaviour',
        filename: 'behaviour.md',
        include: 'optional',
        preselected: true,
        instructions:
          'Write scenarios before rules; each acceptance scenario must be independently checkable.',
        content:
          '# {{specificationTitle}} - Behaviour\n\n## Scenarios\n\n## Rules\n\n## Edge cases\n\n## Acceptance scenarios\n',
      },
      {
        id: 'ux',
        documentType: 'ux',
        filename: 'ux.md',
        include: 'optional',
        preselected: true,
        instructions: 'Cover every state of every screen, including empty and error.',
        content:
          '# {{specificationTitle}} - UX\n\n## Flows\n\n## Screens and states\n\n## Copy\n\n## Responsive behaviour\n\n## Accessibility\n',
      },
      {
        id: 'backend',
        documentType: 'backend',
        filename: 'backend.md',
        include: 'optional',
        preselected: true,
        instructions: 'Name the owner of each contract and mark every test as unit or integration.',
        content:
          '# {{specificationTitle}} - Backend\n\n## Contracts\n\n## Data and ownership\n\n## Invariants\n\n## Errors and recovery\n\n## Verification\n',
      },
      {
        id: 'user-story',
        documentType: 'user-story',
        filename: 'user-story.md',
        include: 'optional',
        instructions: 'One story per section; keep acceptance criteria testable.',
        content: '# {{specificationTitle}} - User story\n\n## Story\n\n## Acceptance criteria\n',
      },
      {
        id: 'decisions',
        documentType: 'decisions',
        filename: 'decisions.md',
        include: 'optional',
        instructions:
          'Add one section block per decision; do not rewrite earlier decisions, supersede them.',
        content:
          '# {{specificationTitle}} - Decisions\n\n## Context\n\n## Options\n\n## Decision\n\n## Consequences\n',
      },
      {
        id: 'research',
        documentType: 'research',
        filename: 'research.md',
        include: 'optional',
        instructions: 'List the questions first; every finding cites a source.',
        content:
          '# {{specificationTitle}} - Research\n\n## Questions\n\n## Sources\n\n## Findings\n',
      },
    ],
  },
  {
    id: 'minimal',
    version: 1,
    title: 'Minimal',
    description: 'A single overview document.',
    useWhen:
      'The work is small, well understood, or exploratory, and you do not yet know which further documents it needs.',
    instructions:
      'Write the overview first. If the work grows beyond one document, add documents from the suggestions or classify existing files; do not duplicate content across documents.',
    requirements: [
      {
        documentType: 'overview',
        minCount: 1,
      },
    ],
    templates: [
      {
        id: 'overview',
        documentType: 'overview',
        filename: 'overview.md',
        include: 'always',
        instructions:
          'Fill Context and Goal first; leave a section empty rather than inventing content.',
        content:
          '---\nid: spec.{{slug}}\ntype: change\ntitle: {{specificationTitleJson}}\nstatus: draft\nchange: {{slug}}\n---\n\n# {{specificationTitle}}\n\n## Context\n\n## Goal\n\n<!-- Initial goal captured when this specification was created; refine or rewrite it freely. -->\n\n{{goalOrPrompt}}\n\n## Non-goals\n\n## Constraints\n\n## Affected Areas\n\n## Acceptance Criteria & Verification\n',
      },
      {
        id: 'decisions',
        documentType: 'decisions',
        filename: 'decisions.md',
        include: 'optional',
        instructions:
          'Add one section block per decision; do not rewrite earlier decisions, supersede them.',
        content:
          '# {{specificationTitle}} - Decisions\n\n## Context\n\n## Options\n\n## Decision\n\n## Consequences\n',
      },
      {
        id: 'research',
        documentType: 'research',
        filename: 'research.md',
        include: 'optional',
        instructions: 'List the questions first; every finding cites a source.',
        content:
          '# {{specificationTitle}} - Research\n\n## Questions\n\n## Sources\n\n## Findings\n',
      },
      {
        id: 'note',
        documentType: 'note',
        filename: 'note.md',
        include: 'optional',
        instructions: 'State why this note belongs here.',
        content: '# {{specificationTitle}} - Note\n',
      },
    ],
  },
];
