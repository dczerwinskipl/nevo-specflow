/*
 * PRESENTATION MOCK DATA ONLY. Shapes follow the draft contracts of PR #92
 * (`@nevo/specflow-contracts/documents`: ArchetypeCatalogue, DocumentTree, DocumentContent), reduced
 * to the fields the screens read. Texts of the built-in catalogue are the authoritative English
 * strings of `docs/product/specflow/specification-documents.md`.
 */

export interface MockDocumentType {
  id: string;
  title: string;
  description: string;
  useWhen: string;
  instructions: string;
  defaultFilename: string;
}

export const documentTypes: MockDocumentType[] = [
  {
    id: 'overview',
    title: 'Overview',
    description:
      'Entry point of the Specification: context, goal, non-goals, constraints, affected areas, acceptance criteria.',
    useWhen: 'Always. Every Specification has exactly one, and it cannot be deleted.',
    instructions:
      'Write this first and keep it current. State the context and the goal in plain terms, list explicit non-goals and constraints, name the affected areas, and write acceptance criteria that can be checked.',
    defaultFilename: 'overview.md',
  },
  {
    id: 'behaviour',
    title: 'Behaviour',
    description:
      'Observable product behaviour: scenarios, rules, edge cases and acceptance scenarios, independent of layout and implementation.',
    useWhen: 'The change alters what the product does for a user or a caller.',
    instructions:
      'Describe what the product does as observable scenarios (given/when/then or short numbered steps), the rules behind them and the edge and failure cases, in the terms of the user or caller. Do not describe screens, layout or implementation.',
    defaultFilename: 'behaviour.md',
  },
  {
    id: 'ux',
    title: 'UX',
    description:
      'The user-experience contract: flows, screens, states, copy, responsive behaviour and accessibility.',
    useWhen: 'The change has a user-facing interface or alters an existing one.',
    instructions:
      'Describe the user journey: flows, each screen and its states (empty, loading, error, success), the exact copy, responsive behaviour and accessibility. Reference existing patterns and name what is new.',
    defaultFilename: 'ux.md',
  },
  {
    id: 'backend',
    title: 'Backend',
    description:
      'Server-side design: contracts, data and ownership, invariants, error cases, recovery and verification.',
    useWhen: 'The change needs new or changed APIs, persistence, Engine or Runtime behaviour.',
    instructions:
      'Describe the server-side contract: the owning module, data and persistence, API and event shapes, invariants, error codes and recovery, and how each is verified.',
    defaultFilename: 'backend.md',
  },
  {
    id: 'architecture',
    title: 'Architecture',
    description:
      'Structural analysis: boundaries, options considered, constraints and the chosen structure.',
    useWhen: 'The work reshapes modules, ownership or dependencies, or answers a design question.',
    instructions:
      'Describe the structure: the problem, the boundaries and owners involved, the options considered with their trade-offs, the chosen structure and the constraints it imposes.',
    defaultFilename: 'architecture.md',
  },
  {
    id: 'decisions',
    title: 'Decisions',
    description: 'Recorded decisions: context, options, decision and consequences.',
    useWhen: 'A choice with lasting consequences was made and should not be rediscovered.',
    instructions:
      'Record each decision as context, the options considered, the decision and its consequences, one decision per section, with who decided and when if known.',
    defaultFilename: 'decisions.md',
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
      "Write stories as 'As a <role> I want <capability> so that <benefit>', each with acceptance criteria.",
    defaultFilename: 'user-story.md',
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
];

export const typeTitle = (id?: string) =>
  documentTypes.find((type) => type.id === id)?.title ?? id ?? '';

export interface MockTemplate {
  id: string;
  type: string;
  filename: string;
  include: 'always' | 'optional';
  preselected?: boolean;
  instructions?: string;
}

export interface MockArchetype {
  id: string;
  version: number;
  title: string;
  description: string;
  useWhen: string;
  instructions?: string;
  requirements: { documentType: string; minCount: number }[];
  documents: MockTemplate[];
}

const overviewTemplate: MockTemplate = {
  id: 'overview',
  type: 'overview',
  filename: 'overview.md',
  include: 'always',
  instructions: 'Fill Context and Goal first; leave a section empty rather than inventing content.',
};
const optional = (type: string, preselected = false): MockTemplate => ({
  id: type,
  type,
  filename: `${type}.md`,
  include: 'optional',
  preselected,
});

export const archetypes: MockArchetype[] = [
  {
    id: 'minimal',
    version: 1,
    title: 'Minimal',
    description: 'A single overview document.',
    useWhen:
      'The work is small, well understood, or exploratory, and you do not yet know which further documents it needs.',
    instructions:
      'Write the overview first. If the work grows beyond one document, add documents from the suggestions or classify existing files; do not duplicate content across documents.',
    requirements: [{ documentType: 'overview', minCount: 1 }],
    documents: [overviewTemplate, optional('decisions'), optional('research'), optional('note')],
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
    requirements: [{ documentType: 'overview', minCount: 1 }],
    documents: [
      overviewTemplate,
      optional('behaviour', true),
      optional('ux', true),
      optional('backend', true),
      optional('user-story'),
      optional('decisions'),
      optional('research'),
    ],
  },
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
    requirements: [{ documentType: 'overview', minCount: 1 }],
    documents: [
      overviewTemplate,
      optional('architecture', true),
      optional('decisions', true),
      optional('research'),
      optional('note'),
    ],
  },
];

/** An owner-configured archetype (slice D-config) that requires a type it only suggests. */
export const ownerFeature: MockArchetype = {
  ...archetypes[1]!,
  id: 'team-feature',
  title: 'Team feature',
  description: 'The team variant of Feature: every change records its decisions.',
  useWhen: 'A product change in a team that keeps a decision log for every feature.',
  requirements: [
    { documentType: 'overview', minCount: 1 },
    { documentType: 'decisions', minCount: 1 },
  ],
  documents: [
    overviewTemplate,
    optional('behaviour', true),
    optional('ux', true),
    optional('decisions'),
    optional('research'),
  ],
};

/* ------------------------------------------------------------------------------------------ */
/* Document tree of one Specification                                                          */
/* ------------------------------------------------------------------------------------------ */

export type MockEntryState = 'registered' | 'unclassified' | 'dangling';
export interface MockDocument {
  id: string;
  path: string;
  state: MockEntryState;
  type?: string;
  kind: 'text' | 'image' | 'binary';
  protected?: boolean;
  /** Derived title (first H1, else the file stem) as `DocumentContent.title` returns it. */
  title: string;
  size?: string;
  mediaType?: string;
}

export const specTitle = 'Single sign-on';

export const treeDocuments: MockDocument[] = [
  {
    id: 'overview',
    path: 'overview.md',
    state: 'registered',
    type: 'overview',
    kind: 'text',
    protected: true,
    title: 'Single sign-on',
  },
  {
    id: 'behaviour',
    path: 'behaviour.md',
    state: 'registered',
    type: 'behaviour',
    kind: 'text',
    title: 'Single sign-on - Behaviour',
  },
  {
    id: 'ux',
    path: 'ux.md',
    state: 'registered',
    type: 'ux',
    kind: 'text',
    title: 'Single sign-on - UX',
  },
  {
    id: 'login-flow',
    path: 'architecture/login-flow.md',
    state: 'registered',
    type: 'ux',
    kind: 'text',
    title: 'Login flow',
  },
  {
    id: 'diagram',
    path: 'architecture/sequence.png',
    state: 'registered',
    type: 'note',
    kind: 'image',
    title: 'sequence',
    size: '84 KB',
    mediaType: 'image/png',
  },
  {
    id: 'u-notes-meeting-2026-10-20-md',
    path: 'notes/meeting-2026-10-20.md',
    state: 'unclassified',
    kind: 'text',
    title: 'Meeting with the identity team',
  },
  {
    id: 'u-notes-token-sample-bin',
    path: 'notes/token-sample.bin',
    state: 'unclassified',
    kind: 'binary',
    title: 'token-sample',
    size: '14.2 KB',
    mediaType: 'application/octet-stream',
  },
  {
    id: 'backend',
    path: 'backend.md',
    state: 'dangling',
    type: 'backend',
    kind: 'text',
    // No file to read a title from: the tab keeps the file name.
    title: 'backend.md',
  },
];

export const treeFolders = ['architecture', 'notes'];

export const fileName = (path: string) => path.split('/').at(-1) ?? path;
export const stem = (path: string) => fileName(path).replace(/\.[^.]+$/, '');
