import type {
  ArchetypeDefinition,
  ArchetypeDefinitionFile,
  DocumentTypeDefinition,
  TemplateDefinition,
} from '@nevo/specflow-contracts/documents';

/**
 * Built-in (shipped default) document types and archetypes, as plain typed data that conforms to the
 * declarative definition schema. Every string is the authoritative English source of
 * `docs/product/specflow/specification-documents.md` ("Document type catalogue", "Authoring
 * instructions", "Template skeletons", "Archetype catalogue") and is copied verbatim; a test compares
 * them with those tables.
 */

const BUILT_IN_DOCUMENT_TYPES: DocumentTypeDefinition[] = [
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
    id: 'ux',
    title: 'UX',
    description:
      'The user-experience contract: flows, screens, states, copy, responsive behaviour and accessibility.',
    useWhen: 'The change has a user-facing interface or alters an existing one.',
    instructions:
      'Describe the user journey: flows, each screen and its states (empty, loading, error, success), the exact copy, responsive behaviour and accessibility. Reference existing patterns and name what is new. Do not restate behaviour rules; link to the behaviour document.',
    defaultFilename: 'ux.md',
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
    id: 'decisions',
    title: 'Decisions',
    description: 'Recorded decisions: context, options, decision and consequences.',
    useWhen: 'A choice with lasting consequences was made and should not be rediscovered.',
    instructions:
      'Record each decision as context, the options considered, the decision and its consequences, one decision per section, with who decided and when if known. Record decisions that are costly to rediscover, not routine choices.',
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
      "Write stories as 'As a <role> I want <capability> so that <benefit>', each with acceptance criteria. Keep stories small and independent and link them to the behaviour they imply.",
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

/** The present Create scaffold for `overview.md`, with the architecture placeholders. */
const OVERVIEW_TEMPLATE_CONTENT = [
  '---',
  'id: spec.{{slug}}',
  'type: change',
  'title: {{specificationTitleJson}}',
  'status: draft',
  'change: {{slug}}',
  '---',
  '',
  '# {{specificationTitle}}',
  '',
  '## Context',
  '',
  '## Goal',
  '',
  '<!-- Initial goal captured when this specification was created; refine or rewrite it freely. -->',
  '',
  '{{goalOrPrompt}}',
  '',
  '## Non-goals',
  '',
  '## Constraints',
  '',
  '## Affected Areas',
  '',
  '## Acceptance Criteria & Verification',
  '',
].join('\n');

/**
 * `# {{specificationTitle}} - <type title>`, a blank line, then for each heading `## <heading>` and a
 * blank line (product document "Template skeletons").
 */
export function templateSkeleton(typeTitle: string, headings: readonly string[]): string {
  const lines = [`# {{specificationTitle}} - ${typeTitle}`, ''];
  for (const heading of headings) lines.push(`## ${heading}`, '');
  return lines.join('\n');
}

interface SkeletonSpec {
  readonly headings: readonly string[];
  readonly instructions: string;
}

const SKELETONS: Readonly<Record<string, SkeletonSpec>> = {
  behaviour: {
    headings: ['Scenarios', 'Rules', 'Edge cases', 'Acceptance scenarios'],
    instructions:
      'Write scenarios before rules; each acceptance scenario must be independently checkable.',
  },
  ux: {
    headings: ['Flows', 'Screens and states', 'Copy', 'Responsive behaviour', 'Accessibility'],
    instructions: 'Cover every state of every screen, including empty and error.',
  },
  backend: {
    headings: [
      'Contracts',
      'Data and ownership',
      'Invariants',
      'Errors and recovery',
      'Verification',
    ],
    instructions: 'Name the owner of each contract and mark every test as unit or integration.',
  },
  architecture: {
    headings: ['Context', 'Options considered', 'Chosen structure', 'Constraints'],
    instructions: 'Give at least two options with trade-offs before the chosen structure.',
  },
  decisions: {
    headings: ['Context', 'Options', 'Decision', 'Consequences'],
    instructions:
      'Add one section block per decision; do not rewrite earlier decisions, supersede them.',
  },
  research: {
    headings: ['Questions', 'Sources', 'Findings'],
    instructions: 'List the questions first; every finding cites a source.',
  },
  'user-story': {
    headings: ['Story', 'Acceptance criteria'],
    instructions: 'One story per section; keep acceptance criteria testable.',
  },
  note: { headings: [], instructions: 'State why this note belongs here.' },
};

const OVERVIEW_TEMPLATE: TemplateDefinition = {
  id: 'overview',
  documentType: 'overview',
  filename: 'overview.md',
  include: 'always',
  instructions: 'Fill Context and Goal first; leave a section empty rather than inventing content.',
  content: OVERVIEW_TEMPLATE_CONTENT,
};

/** A suggested template of a built-in document type. The template id is the document type id. */
function suggestion(typeId: string, preselected: boolean): TemplateDefinition {
  const type = BUILT_IN_DOCUMENT_TYPES.find((candidate) => candidate.id === typeId);
  const skeleton = SKELETONS[typeId];
  if (!type || !skeleton || !type.defaultFilename) {
    throw new Error(`Built-in suggestion for unknown document type "${typeId}".`);
  }
  return {
    id: typeId,
    documentType: typeId,
    filename: type.defaultFilename,
    include: 'optional',
    ...(preselected ? { preselected: true } : {}),
    instructions: skeleton.instructions,
    content: templateSkeleton(type.title, skeleton.headings),
  };
}

const OVERVIEW_ONLY_REQUIREMENTS = [{ documentType: 'overview', minCount: 1 }] as const;

const BUILT_IN_ARCHETYPES: ArchetypeDefinition[] = [
  {
    id: 'minimal',
    version: 1,
    title: 'Minimal',
    description: 'A single overview document.',
    useWhen:
      'The work is small, well understood, or exploratory, and you do not yet know which further documents it needs.',
    instructions:
      'Write the overview first. If the work grows beyond one document, add documents from the suggestions or classify existing files; do not duplicate content across documents.',
    requirements: [...OVERVIEW_ONLY_REQUIREMENTS],
    templates: [
      OVERVIEW_TEMPLATE,
      suggestion('decisions', false),
      suggestion('research', false),
      suggestion('note', false),
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
    requirements: [...OVERVIEW_ONLY_REQUIREMENTS],
    templates: [
      OVERVIEW_TEMPLATE,
      suggestion('behaviour', true),
      suggestion('ux', true),
      suggestion('backend', true),
      suggestion('user-story', false),
      suggestion('decisions', false),
      suggestion('research', false),
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
    requirements: [...OVERVIEW_ONLY_REQUIREMENTS],
    templates: [
      OVERVIEW_TEMPLATE,
      suggestion('architecture', true),
      suggestion('decisions', true),
      suggestion('research', false),
      suggestion('note', false),
    ],
  },
];

export const BUILT_IN_DEFINITIONS: ArchetypeDefinitionFile = {
  schemaVersion: 1,
  documentTypes: BUILT_IN_DOCUMENT_TYPES,
  archetypes: BUILT_IN_ARCHETYPES,
};
