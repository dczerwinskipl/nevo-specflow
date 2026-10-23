/*
 * Static, hardcoded data for the Editor mode mock (presentation only, Storybook design validation).
 * Nothing here is a product contract; it never reaches the production bundle.
 */

/** What a tab holds. The strip is blind to it; a registry maps kind -> renderer + header actions. */
export type ContentKind = 'md' | 'code' | 'image' | 'binary';

export interface MockDocument {
  id: string;
  /** Full path inside the specification, shown in tooltips and the Opened menu. */
  path: string;
  kind: ContentKind;
  /** `ready` unless the fixture demonstrates a transient or failed open. */
  state: 'ready' | 'loading' | 'missing';
  /** Required documents show the same marker the real tree uses. */
  required?: boolean;
  /** Code/markdown files the user may edit. Images and binaries never are. */
  editable?: boolean;
}

export const mockDocuments: readonly MockDocument[] = [
  {
    id: 'specification',
    path: 'specification.md',
    kind: 'md',
    state: 'ready',
    required: true,
    editable: true,
  },
  { id: 'plan', path: 'plan.md', kind: 'md', state: 'ready', editable: true },
  { id: 'decisions', path: 'notes/decisions.md', kind: 'md', state: 'ready', editable: true },
  { id: 'api-contract', path: 'notes/api-contract.md', kind: 'md', state: 'ready', editable: true },
  { id: 'glossary', path: 'notes/glossary.md', kind: 'md', state: 'ready', editable: true },
  {
    id: 'acceptance',
    path: 'notes/acceptance-criteria-for-single-sign-on-and-session-handling.md',
    kind: 'md',
    state: 'ready',
    editable: true,
  },
  {
    id: 'idp',
    path: 'architecture/identity-provider-integration-guidelines-v2.md',
    kind: 'md',
    state: 'ready',
    editable: true,
  },
  {
    id: 'sequence',
    path: 'architecture/login-sequence.md',
    kind: 'md',
    state: 'ready',
    editable: true,
  },
  {
    id: 'migration',
    path: 'architecture/migration-from-password-login.md',
    kind: 'md',
    state: 'ready',
    editable: true,
  },
  { id: 'architecture-png', path: 'architecture/architecture.png', kind: 'image', state: 'ready' },
  { id: 'auth-service', path: 'src/AuthService.cs', kind: 'code', state: 'ready', editable: true },
];

export const documentById = (id: string) => mockDocuments.find((doc) => doc.id === id)!;
export const fileName = (path: string) => path.split('/').at(-1) ?? path;

/** Tree data in the shape the product explorer takes (see DemoDocumentTree). */
export const treeFolders = ['notes', 'architecture', 'src'] as const;

const lines = (...rows: string[]) => rows.join('\n');

const sources: Record<string, string> = {
  specification: lines(
    '# Feature: Single sign-on',
    '',
    '## Problem',
    '',
    'Employees sign in through the corporate identity provider, without an extra password,',
    'and return to the project they had open before authentication.',
    '',
    '## Behavior',
    '',
    '- The identity token is verified before a session is created.',
    '- Cancelling at the provider does not create a session.',
    '- Signing out ends the session in SpecFlow and offers provider sign-out.',
    '',
    '## Acceptance criteria',
    '',
    '1. A user without a provider account sees an explanation, not a raw error.',
    '2. Token verification failures are logged with a correlation id.',
    '3. `identity_token` is never written to the browser console.',
    '',
    '```ts',
    'const session = await verify(identityToken, { audience: "specflow" });',
    '```',
    '',
    '> Open question: should provider sign-out be the default?',
  ),
  plan: lines(
    '# Plan',
    '',
    '- [x] Confirm provider metadata',
    '- [ ] Implement token verification',
  ),
  decisions: lines(
    '# Decisions',
    '',
    '## OIDC over SAML',
    '',
    'We use **OpenID Connect** because the provider supports it natively and the token format is',
    'simpler to verify on the Runtime.',
    '',
    '## Session lifetime',
    '',
    '- Sessions end after eight hours of inactivity.',
    '- A refresh never extends beyond the provider limit.',
    '',
    '---',
    '',
    'See `AuthService.cs` for the implementation.',
  ),
  'api-contract': lines(
    '# API contract',
    '',
    '| Endpoint | Purpose |',
    '| --- | --- |',
    '| `POST /auth/callback` | Exchange the provider code for a session |',
    '| `POST /auth/logout` | End the session |',
  ),
  glossary: lines('# Glossary', '', '- **IdP**: the corporate identity provider.'),
  acceptance: lines(
    '# Acceptance criteria',
    '',
    '- The callback rejects a mismatched `state` value.',
  ),
  idp: lines(
    '# Identity provider integration guidelines',
    '',
    '## Required claims',
    '',
    '- `sub`, `email`, `name`',
  ),
  sequence: lines(
    '# Login sequence',
    '',
    '1. Browser requests the sign-in route.',
    '2. Runtime redirects to the provider.',
  ),
  migration: lines(
    '# Migration from password login',
    '',
    'Existing accounts are linked by verified email.',
  ),
  'auth-service': lines(
    'using System.Threading.Tasks;',
    '',
    'namespace SpecFlow.Auth;',
    '',
    '// Verifies the identity token and creates a Runtime session.',
    'public class AuthService',
    '{',
    '    private readonly ITokenVerifier verifier;',
    '    private const int SessionHours = 8;',
    '',
    '    public AuthService(ITokenVerifier verifier) => this.verifier = verifier;',
    '',
    '    public async Task<Session> SignInAsync(string identityToken)',
    '    {',
    '        var claims = await verifier.VerifyAsync(identityToken, "specflow");',
    '        if (claims is null)',
    '        {',
    '            throw new UnauthorizedException("Token rejected");',
    '        }',
    '',
    '        return Session.Start(claims.Subject, SessionHours);',
    '    }',
    '}',
  ),
};

/** The saved source of a mock document. */
export const sourceOf = (id: string) =>
  sources[id] ?? lines(`# ${fileName(documentById(id).path)}`, '', 'Static mock content.');

/** A line appended to demonstrate an unsaved draft. */
export const DIRTY_SUFFIX = '\n\nUnsaved line added in the editor.';

/** The assistant message of the Sessions host variant links two files by id. */
export const sessionMessages = [
  { id: 'm1', role: 'user', text: 'Which documents describe the sign-in flow?' },
  {
    id: 'm2',
    role: 'agent',
    text: 'The flow is described in two places. The overall behavior is in',
    files: ['specification', 'sequence'],
  },
] as const;

export type TabPreset = 'mixed' | 'twoEditors' | 'empty';

export interface PresetState {
  open: string[];
  active: string | null;
  dirty: string[];
  /** Per-tab view, remembered separately for each tab (default: the kind's default view). */
  views?: Record<string, string>;
}

export const presets: Record<TabPreset, PresetState> = {
  // The first four tabs show four kinds/states; the rest only exist to overflow the strip.
  mixed: {
    open: [
      'specification',
      'decisions',
      'auth-service',
      'architecture-png',
      'api-contract',
      'acceptance',
      'idp',
      'migration',
    ],
    active: 'specification',
    dirty: ['decisions', 'migration'],
    views: { decisions: 'edit' },
  },
  // Two markdown tabs both in edit: scroll one, switch, come back (state is restored per document).
  twoEditors: {
    open: ['specification', 'decisions'],
    active: 'specification',
    dirty: [],
    views: { specification: 'edit', decisions: 'edit' },
  },
  empty: { open: [], active: null, dirty: [] },
};
