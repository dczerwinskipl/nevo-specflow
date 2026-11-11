/*
 * PRESENTATION MOCK ONLY (design validation for docs/product/specflow/ui/documentation-reader.md).
 * Static fixture data for the workspace documentation reader. Shapes are UX assumptions, not the
 * backend contract: the Runtime API for the reader does not exist yet.
 */

export interface MockWorkspace {
  workspaceId: string;
  /** Registry name (the folder name); no Git branch on the read path. */
  name: string;
  /** The Runtime's own checkout: hybrid search; Sessions run here. */
  isRuntimeWorkspace?: boolean;
  kind: 'main' | 'worktree';
  /** Folder shown to the user (project-relative for a worktree). */
  folder: string;
  /** Titles of the Specifications bound to this workspace. */
  specifications: string[];
  dirty?: boolean;
  available: boolean;
  unavailableReason?: string;
}

export const workspaces: MockWorkspace[] = [
  {
    workspaceId: 'ws-main',
    name: 'nevo-specflow',
    isRuntimeWorkspace: true,
    kind: 'main',
    folder: 'D:/repos/nevo-specflow',
    specifications: [],
    available: true,
  },
  {
    workspaceId: 'ws-sso',
    name: 'ui-1234-single-sign-on-with-the-corporate-identity-provider',
    kind: 'worktree',
    folder: '.nevo/worktrees/ui-1234-single-sign-on-with-the-corporate-identity-provider',
    specifications: ['Single sign-on with the corporate identity provider'],
    dirty: true,
    available: true,
  },
  {
    workspaceId: 'ws-reader',
    name: 'docs-reader',
    kind: 'worktree',
    folder: '.nevo/worktrees/docs-reader',
    specifications: ['Czytnik dokumentacji projektu'],
    available: true,
  },
  {
    workspaceId: 'ws-gone',
    name: 'old-indexer',
    kind: 'worktree',
    folder: '.nevo/worktrees/old-indexer',
    specifications: [],
    available: false,
    unavailableReason: 'Folder unavailable',
  },
];

export interface MockDoc {
  /** Stable frontmatter `id`; the same id across workspaces. */
  id: string;
  /** Path under docs.root. */
  path: string;
  title: string;
  type: string;
  status: 'current' | 'draft';
  summary: string;
  areas?: string[];
  related?: string[];
  /** Renderable Markdown body without the frontmatter. */
  body: string;
}

/** docs.yaml `nonAuthoritative` prefixes. */
export const nonAuthoritativePrefixes = ['ideas/'];
export const isNonAuthoritative = (path: string) =>
  nonAuthoritativePrefixes.some((prefix) => path.startsWith(prefix));

function body(title: string, sections: [string, string][]): string {
  return [`# ${title}`, '', ...sections.flatMap(([h, text]) => [`## ${h}`, '', text, ''])].join(
    '\n',
  );
}

const lorem =
  'The rule applies to every surface that shows this information. Exceptions are recorded in the owning document, not in the implementation, so that a later change can find them.';

/** A document whose body is generated from its title (keeps the fixture small). */
function doc(
  id: string,
  path: string,
  title: string,
  summary: string,
  extra: Partial<MockDoc> = {},
): MockDoc {
  return {
    id,
    path,
    title,
    type: extra.type ?? (path.endsWith('README.md') ? 'hub' : 'product'),
    status: extra.status ?? 'current',
    summary,
    body:
      extra.body ??
      body(title, [
        ['Purpose', summary],
        ['Rules', `${lorem}\n\n- One owner per rule.\n- Link instead of copying.`],
        ['Open questions', 'None at the moment.'],
      ]),
    ...extra,
  };
}

const interactionModel = `# UI interaction model

\`status: draft\` — working guidance, expanded as the code it governs lands.

## Interaction principles

- **Preserve context.** Drilling down keeps the user oriented; going back returns them to where they were, with scroll and selection intact.
- **Back follows the product hierarchy**, not raw browser history.
- **A route is not automatically global navigation.** Full Session and Full Task can have stable product routes without earning persistent sidebar items.

## Responsive shell

Navigation collapse and workspace stacking are separate responsive decisions.

| Shell | Navigation | Workspace |
| --- | --- | --- |
| **Wide** | Persistent navigation. | Primary + Secondary can be visible together. |
| **Compact** | Drawer navigation. | Primary + Secondary can still be visible together. |
| **Narrow** | Drawer navigation. | One workspace surface is visible at a time. |

Do not equate "no persistent sidebar" with "mobile". See [Shell geometry](shell-geometry.md) and the [layout rules](../../../design-system/principles/layout-and-containment.md#bounded-workspace-rule).

## Product hierarchy

The default product entry is the **Specifications** list at \`/\`. Specification overview owns \`/specs/:specId\`.

\`\`\`text
Project
├── Specifications                        default entry
│   └── Specification overview            /specs/:specId
└── Session                               /sessions/:sessionId, top-level route
\`\`\`

### Starting a Session and the navigator

Every UI start of a Session is from a Specification. Existing standalone Sessions stay reachable by direct link; their Context and navigator show no Specification.

![Navigator states](images/navigator-states.png)

## Back and Close

Product Back inside Secondary follows the local inspection stack. Browser/system Back normally follows router history; on **Narrow** the local pushed stack pops first.

Related reading: [AI-session UX](ai-session-ux.md), [Full Session](full-session.md), the [decision records](../../../architecture/decisions/) folder, the old [navigation proposal](../../../ideas/navigation-v1.md) (superseded), the router source [router.tsx](../../../../packages/specflow-ui/src/app/router.tsx), an [external guide](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/) and an unsafe [local file](file:///C:/Users/dev/notes.md).
`;

const authRecoveryMain = body('Authentication recovery', [
  [
    'When the session expires',
    'The UI keeps the current screen and asks the user to sign in again in a dialog. Unsaved text in the Composer and in open documents stays.',
  ],
  [
    'When the Runtime is unavailable',
    'The UI shows the Runtime unavailable screen and retries in the background. The address the user wanted is kept as `returnTo`.',
  ],
  ['Single sign-on', 'Not supported yet. Local accounts only.'],
]);

const authRecoverySso = body('Authentication recovery', [
  [
    'When the session expires',
    'The UI keeps the current screen and, with single sign-on, sends the user to the corporate identity provider in the same tab; after consent the user returns to the screen they had open.',
  ],
  [
    'When the Runtime is unavailable',
    'The UI shows the Runtime unavailable screen and retries in the background.',
  ],
  [
    'Single sign-on',
    'Employees sign in through the corporate identity provider, without an extra password. A user without a provider account sees an explanation, not a raw error. Token verification failures are logged with a correlation id.',
  ],
]);

const glossaryPl = `# Słownik pojęć

Dokument ustala polskie nazwy pojęć widocznych w interfejsie.

## Środowisko pracy

**Środowisko pracy** to checkout projektu: główny folder albo powiązany worktree, w którym powstają i są rozwijane specyfikacje. Nie używamy słowa „workspace” w treści dla użytkownika.

## Gałąź i commit

Gałąź Git nazywamy **gałęzią**. Słowo **commit** zostaje po angielsku i odmienia się: „commita”, „w commicie”.

## Dokumentacja projektu a dokumenty specyfikacji

Dokumentacja projektu leży w \`docs/\` i opisuje cały produkt. Dokumenty specyfikacji należą do jednej specyfikacji i są edytowane na ekranie Dokumenty.
`;

const readerIdea = body('Workspace-aware documentation reader', [
  [
    'Observed gap',
    'The Runtime reads documentation only from the Project Home checkout, so a Specification that works in a linked worktree may read stale documentation.',
  ],
  [
    'Proposal',
    'A read-only reader of the project documentation for a selected registered workspace, with a tree, lexical or hybrid search and a Markdown article.',
  ],
  ['Open questions', 'Whether Documentation earns a permanent global navigation entry.'],
]);

export const mainDocs: MockDoc[] = [
  doc(
    'docs.readme',
    'README.md',
    'Nevo SpecFlow documentation',
    'Start here: how the documentation is organised and where each kind of rule lives.',
    { type: 'hub' },
  ),
  doc(
    'docs.glossary-pl',
    'slownik-pojec.md',
    'Słownik pojęć',
    'Polskie nazwy pojęć widocznych w interfejsie: środowisko pracy, gałąź, commit.',
    { body: glossaryPl, type: 'reference' },
  ),
  doc(
    'architecture.readme',
    'architecture/README.md',
    'Architecture',
    'Principles, runtime architecture and decision records.',
    { type: 'hub' },
  ),
  doc(
    'architecture.principles.normative-language',
    'architecture/principles/normative-language.md',
    'Normative language and document authority',
    'Defines MUST, SHOULD, MAY, document authority, conflict handling and no-extrapolation rules.',
    { type: 'architecture' },
  ),
  doc(
    'architecture.principles.enforceable-invariants',
    'architecture/principles/enforceable-invariants.md',
    'Enforceable invariants',
    'Invariants are owned by code that enforces them; prose describes them.',
    { type: 'architecture' },
  ),
  doc(
    'architecture.runtime.authorization',
    'architecture/runtime/authorization.md',
    'Runtime authorization',
    'Capabilities, scopes and how every Runtime operation is authorized.',
    { type: 'architecture' },
  ),
  doc(
    'architecture.runtime.endpoint-policy',
    'architecture/runtime/endpoint-policy.md',
    'Endpoint policy',
    'Rate limits, caching headers and admission shared by Runtime endpoints.',
    { type: 'architecture' },
  ),
  doc(
    'architecture.runtime.workspace-registry',
    'architecture/runtime/workspace-registry-and-checkout-binding-for-linked-worktrees.md',
    'Workspace registry and checkout binding for linked worktrees, including rebinding after a folder move and recovery of orphaned Specification bindings',
    'How the Engine registers checkouts, binds Specifications to them and rebinds after a move.',
    { type: 'architecture' },
  ),
  doc(
    'adr.0020-documentation-discovery-is-a-product-capability',
    'architecture/decisions/0020-documentation-discovery-is-a-product-capability.md',
    'ADR 0020: Documentation discovery is a product capability',
    'Documentation search is part of the product, used by agents and people alike.',
    { type: 'adr' },
  ),
  doc(
    'adr.0021-product-neutral-ai-semantic-search-engine',
    'architecture/decisions/0021-product-neutral-ai-semantic-search-engine.md',
    'ADR 0021: Product-neutral AI semantic search engine',
    'The semantic search engine stays product-neutral behind a chunk source port.',
    { type: 'adr' },
  ),
  doc(
    'design-system.readme',
    'design-system/README.md',
    'Design system',
    'Nevo UI principles and implementation guidance.',
    { type: 'hub' },
  ),
  doc(
    'design-system.principles.information-hierarchy',
    'design-system/principles/information-hierarchy.md',
    'Semantic information hierarchy',
    'Canonical semantic roles for structured product information and their default typography.',
    { type: 'engineering' },
  ),
  doc(
    'design-system.principles.layout-and-containment',
    'design-system/principles/layout-and-containment.md',
    'Layout and containment guidelines',
    'Borderless-first rules for grouping and containment.',
    { type: 'engineering', status: 'draft' },
  ),
  doc(
    'design-system.principles.ui-ux-guidelines',
    'design-system/principles/ui-ux-guidelines.md',
    'UI/UX engineering guidelines',
    'Validate the composed screen, semantic tokens, progressive disclosure and visual self-review.',
    { type: 'engineering', status: 'draft' },
  ),
  doc(
    'design-system.implementation.react.item-tabs',
    'design-system/implementation/react/item-tabs.md',
    'Item tabs and content tabs host',
    'The tab strip, open-item state and content-host rules.',
    { type: 'engineering' },
  ),
  doc(
    'design-system.implementation.storybook.guidelines',
    'design-system/implementation/storybook/guidelines.md',
    'Storybook guidelines',
    'How stories, tags and capture stories are organised.',
    { type: 'engineering' },
  ),
  doc(
    'engineering.readme',
    'engineering/README.md',
    'Engineering',
    'Repository workflow, testing and tooling.',
    { type: 'hub' },
  ),
  doc(
    'engineering.repository.git-workflow',
    'engineering/repository/git-workflow.md',
    'Git workflow',
    'Branches, commits, pull requests and the merge policy.',
    { type: 'engineering' },
  ),
  doc(
    'engineering.shared.testing',
    'engineering/shared/testing.md',
    'Testing',
    'Test layers, budgets and where each kind of test lives.',
    { type: 'engineering' },
  ),
  doc('product.readme', 'product/README.md', 'Product', 'What Nevo SpecFlow does and for whom.', {
    type: 'hub',
  }),
  doc(
    'product.shared.vocabulary',
    'product/shared/vocabulary.md',
    'Product vocabulary',
    'Screen names, Git and workspace vocabulary and their Polish renderings.',
    { type: 'product' },
  ),
  doc(
    'product.specflow.specification-documents',
    'product/specflow/specification-documents.md',
    'Specification archetypes and documents',
    'Document types, archetypes and requirements of a Specification.',
    { type: 'product' },
  ),
  doc(
    'docs.product-specflow-ui-readme',
    'product/specflow/ui/README.md',
    'SpecFlow UI product documentation',
    'Who uses the UI, how navigation and surfaces behave, and how AI sessions are presented.',
    { type: 'hub' },
  ),
  doc(
    'product.specflow.ui.interaction-model',
    'product/specflow/ui/interaction-model.md',
    'UI interaction model',
    'Responsive shell, product hierarchy and routes, reachability, Back/Close semantics and surface choice.',
    {
      body: interactionModel,
      status: 'draft',
      areas: ['ui'],
      related: [
        'product.specflow.ui.ai-session-ux',
        'product.specflow.ui.shell-geometry',
        'product.specflow.ui.navigation-v0',
      ],
    },
  ),
  doc(
    'product.specflow.ui.ai-session-ux',
    'product/specflow/ui/ai-session-ux.md',
    'AI-session UX',
    'Turn state, Work information levels, commentary, live versus historical.',
    { status: 'draft' },
  ),
  doc(
    'product.specflow.ui.full-session',
    'product/specflow/ui/full-session.md',
    'Full Session',
    'The Session screen: conversation, Work block and Work history, Composer, Context and tabs.',
  ),
  doc(
    'product.specflow.ui.shell-geometry',
    'product/specflow/ui/shell-geometry.md',
    'App Shell geometry decisions',
    'Focused frame and Workspace modes, two-column Create and Overview, rejected alternatives.',
  ),
  doc(
    'product.specflow.ui.authentication-recovery',
    'product/specflow/ui/authentication-recovery.md',
    'Authentication recovery',
    'How the UI recovers when the Runtime session expires or authentication fails.',
    { body: authRecoveryMain },
  ),
  doc(
    'product.specflow.ui.documents-editor-mode',
    'product/specflow/ui/documents-editor-mode.md',
    'Documents editor mode',
    'Documents with several open tabs, read-only tabs in a Session, tablet threshold.',
    { status: 'draft' },
  ),
  doc(
    'reference.readme',
    'reference/README.md',
    'Reference',
    'Exact API, CLI and configuration contracts.',
    { type: 'hub' },
  ),
  doc(
    'reference.api.docs-search',
    'reference/api/docs-search.md',
    'Documentation search and status HTTP API',
    'GET /api/docs/search answers ranked documents with their best sections; GET /api/docs/status reports the semantic search status.',
    { type: 'reference' },
  ),
  doc(
    'reference.api.specification-documents',
    'reference/api/specification-documents.md',
    'Specification documents HTTP API',
    'Tree, read, write and import of Specification documents.',
    { type: 'reference' },
  ),
  doc(
    'reference.cli.nevo-specflow-docs',
    'reference/cli/nevo-specflow-docs.md',
    'nevo-specflow docs',
    'list, find, get, context, search and semantic commands of the documentation CLI.',
    { type: 'reference' },
  ),
  doc(
    'reference.configuration.documentation-and-embeddings',
    'reference/configuration/documentation-and-embeddings.md',
    'Documentation and embeddings configuration',
    'docs.root, docs.yaml (taxonomy, nonAuthoritative, exclude) and the ai.embeddings endpoint.',
    { type: 'reference' },
  ),
  doc(
    'ideas.semantic-docs',
    'ideas/semantic-docs/README.md',
    'Semantic docs search — ideas',
    'Open items after the semantic search PRs.',
    { type: 'hub', status: 'draft' },
  ),
  doc(
    'ideas.semantic-docs.surfaces-and-setup',
    'ideas/semantic-docs/surfaces-and-setup.md',
    'Semantic docs search — human reader, workspace retrieval and setup follow-ups',
    'Proposals: a workspace-aware human documentation reader, project-level authorization and corpus revisions.',
    { body: readerIdea, type: 'engineering', status: 'draft' },
  ),
  doc(
    'ideas.semantic-docs.search-quality',
    'ideas/semantic-docs/search-quality.md',
    'Semantic docs search — search quality',
    'BM25 postings for large corpora, evaluation sets and ranking experiments.',
    { type: 'engineering', status: 'draft' },
  ),
];

const ssoDoc = doc(
  'product.specflow.ui.single-sign-on',
  'product/specflow/ui/single-sign-on.md',
  'Single sign-on',
  'Signing in through the corporate identity provider and returning to the screen the user had open.',
  {
    body: body('Single sign-on', [
      [
        'Flows',
        '1. The user chooses "Sign in with Acme ID".\n2. The provider page opens in the same tab.\n3. After consent the user returns to the project they had open.',
      ],
      [
        'Screens and states',
        '- Sign-in: idle, redirecting, provider error.\n- Account without access: explanation and the administrator contact.',
      ],
    ]),
    related: ['product.specflow.ui.authentication-recovery'],
  },
);

/** The feature worktree: one document changed, one added, one idea removed. */
export const ssoDocs: MockDoc[] = [
  ...mainDocs
    .filter((d) => d.id !== 'ideas.semantic-docs.search-quality')
    .map((d) =>
      d.id === 'product.specflow.ui.authentication-recovery' ? { ...d, body: authRecoverySso } : d,
    ),
  ssoDoc,
];

export function docsFor(workspaceId: string): MockDoc[] {
  return workspaceId === 'ws-sso' ? ssoDocs : mainDocs;
}

/* ---------------------------------------------------------------------------------------- */
/* Sections and search (a tiny lexical stand-in for the Runtime search)                      */
/* ---------------------------------------------------------------------------------------- */

export interface MockSection {
  sectionId: string;
  /** Heading path without the document title. */
  headingPath: string[];
  /** 1-based line of the heading in the renderable body. */
  line: number;
  text: string;
}

const slug = (heading: string) =>
  heading
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ł]+/g, '-')
    .replace(/^-|-$/g, '') || 'section';

/** Sections by the CLI rule: parent id + `/` + heading slug. */
export function sectionsOf(source: string): MockSection[] {
  const lines = source.split('\n');
  const sections: MockSection[] = [];
  const stack: { level: number; id: string; text: string }[] = [];
  let inFence = false;
  lines.forEach((line, index) => {
    if (line.startsWith('```')) {
      inFence = !inFence;
    }

    const match = !inFence && /^(#{1,4})\s+(.+)$/.exec(line);
    if (match) {
      const level = match[1]!.length;
      const text = match[2]!.trim();
      while (stack.length && stack.at(-1)!.level >= level) {
        stack.pop();
      }

      const parent = stack.at(-1);
      const id = parent ? `${parent.id}/${slug(text)}` : slug(text);
      stack.push({ level, id, text });
      sections.push({
        sectionId: id,
        headingPath: stack.slice(1).map((s) => s.text),
        line: index + 1,
        text: '',
      });
    } else if (sections.length) {
      sections.at(-1)!.text += `${line} `;
    }
  });

  return sections;
}

export interface MockResult {
  doc: MockDoc;
  section?: MockSection;
  snippet: string;
}

export function search(
  docs: MockDoc[],
  query: string,
  includeNonAuthoritative: boolean,
): { results: MockResult[]; hiddenNonAuthoritative: number } {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);
  const scored: { result: MockResult; score: number; na: boolean }[] = [];
  for (const d of docs) {
    let best: { section?: MockSection; score: number } = { score: 0 };
    const titleHits = words.filter((w) => d.title.toLowerCase().includes(w)).length;
    for (const section of sectionsOf(d.body)) {
      const hay = `${section.headingPath.join(' ')} ${section.text}`.toLowerCase();
      const score = words.filter((w) => hay.includes(w)).length;
      if (score > best.score) {
        best = { section, score };
      }
    }

    const summaryHits = words.filter((w) => d.summary.toLowerCase().includes(w)).length;
    const score = titleHits * 3 + best.score * 2 + summaryHits;
    if (score === 0) {
      continue;
    }

    const plain = (best.section?.text ?? d.summary)
      .replace(/[*`#|]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const at = Math.max(0, plain.toLowerCase().indexOf(words[0] ?? '') - 40);
    const snippet = `${at > 0 ? '…' : ''}${plain.slice(at, at + 180)}${plain.length > at + 180 ? '…' : ''}`;
    scored.push({
      result: {
        doc: d,
        section: best.section?.headingPath.length ? best.section : undefined,
        snippet,
      },
      score,
      na: isNonAuthoritative(d.path),
    });
  }

  scored.sort((a, b) => b.score - a.score);

  return {
    results: scored
      .filter((s) => includeNonAuthoritative || !s.na)
      .map((s) => s.result)
      .slice(0, 10),
    hiddenNonAuthoritative: includeNonAuthoritative ? 0 : scored.filter((s) => s.na).length,
  };
}

/** Ids that existed but are inactive (superseded) in every workspace: hidden from the tree. */
export const inactiveDocs: Record<string, { id: string; title: string; supersededBy?: string }> = {
  'ideas/navigation-v1.md': {
    id: 'product.specflow.ui.navigation-v0',
    title: 'Navigation proposal v1',
    supersededBy: 'product.specflow.ui.interaction-model',
  },
};

/* ---------------------------------------------------------------------------------------- */
/* Skipped documents (invalid ones are skipped, never fail the whole workspace)              */
/* ---------------------------------------------------------------------------------------- */

export interface MockSkipped {
  /** Path under docs.root. */
  path: string;
  error: string;
}

const skippedMany: MockSkipped[] = [
  {
    path: 'product/specflow/ui/full-session.md',
    error:
      'Frontmatter: `status` must be one of current, draft, deprecated, superseded (found "wip").',
  },
  {
    path: 'architecture/decisions/0022-workspace-scoped-documentation-reader-with-project-level-authorization-and-corpus-revisions.md',
    error: 'Frontmatter: required field `summary` is missing.',
  },
  {
    path: 'engineering/repository/release-notes-2026-11.md',
    error:
      'Duplicate id `engineering.repository.git-workflow` (also docs/engineering/repository/git-workflow.md).',
  },
  {
    path: 'reference/api/workspaces.md',
    error: 'Frontmatter is not valid YAML (line 7: unexpected indentation).',
  },
  {
    path: 'design-system/principles/motion.md',
    error: 'Frontmatter: area `motion` is not in the taxonomy of docs.yaml.',
  },
];

export function skippedDocsFor(scenario: string): MockSkipped[] {
  return scenario === 'skipped-one'
    ? skippedMany.slice(0, 1)
    : scenario === 'skipped-many'
      ? skippedMany
      : [];
}
