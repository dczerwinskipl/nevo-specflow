/**
 * The operation groups of the document, in display order. Every documented route declares exactly
 * one of them in its schema `tags`, with a non-empty `summary`; a documented route without them,
 * with another tag or with more than one is refused at registration. The group of an operation is
 * never derived from its URL (the document and Task operations live under `/api/specs/`).
 */
export const OPENAPI_TAGS = [
  {
    name: 'Authentication',
    description: 'Password and OIDC login, logout and the authentication state of the caller.',
  },
  { name: 'Authorization', description: 'The capabilities of the caller on a resource.' },
  {
    name: 'Sessions',
    description:
      'Agent Sessions: create, list, read the conversation and its work, run Turns, manage.',
  },
  {
    name: 'Session Providers',
    description: 'The agent providers and models a Session can be started with.',
  },
  { name: 'Session Telemetry', description: 'Usage, cost and provider limits of a Session.' },
  {
    name: 'Specifications',
    description: 'Overview, creation, workspace view and closing of Specifications.',
  },
  {
    name: 'Documents',
    description: 'Specification documents: tree, reads, writes, commits and document operations.',
  },
  { name: 'Tasks', description: 'Task reads of a Specification: detail, history and resources.' },
  {
    name: 'Operations',
    description: 'Status and progress of long-running operations across features.',
  },
  {
    name: 'Workspaces',
    description: 'Closing a linked worktree and a whole workspace (checkout).',
  },
  {
    name: 'Documentation',
    description:
      "The project's own documentation: search and the status of its semantic search index.",
  },
  { name: 'Runtime', description: 'The Runtime itself: its mode and this OpenAPI document.' },
] as const;

export type OpenApiTag = (typeof OPENAPI_TAGS)[number]['name'];

const TAG_NAMES = new Set<string>(OPENAPI_TAGS.map((tag) => tag.name));

/** Refuses a documented route without exactly one known tag or without a summary. */
export function assertTagAndSummary(route: {
  readonly method: string;
  readonly url: string;
  readonly schema?: { readonly tags?: readonly string[]; readonly summary?: unknown };
}): void {
  const tags = route.schema?.tags;
  if (tags?.length !== 1 || !TAG_NAMES.has(tags[0]!)) {
    throw new Error(
      `Route ${route.method} ${route.url} must declare exactly one of the OpenAPI tags.`,
    );
  }

  if (typeof route.schema?.summary !== 'string' || !/\S/.test(route.schema.summary)) {
    throw new Error(`Route ${route.method} ${route.url} must declare a summary.`);
  }
}
