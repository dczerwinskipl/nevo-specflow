// GENERATED from live answers of the dogfooding Runtime (2026-11-14) by the design review script.
// `snippet` is the shipped excerpt (raw Markdown). `text` and `matches` APPROXIMATE the proposed
// API from that snippet: one fragment around the best match (a sentence run, one list item or one
// table row with its cells separated by an em dash), plain text, the window at most 40 characters
// before the first match, the first occurrence of each term marked, at most 3 marks.

export interface MockHit {
  readonly id: string;
  readonly title: string;
  readonly file: string;
  readonly proposal: boolean;
  readonly headingPath: readonly string[];
  readonly snippet: string;
  readonly text: string;
  readonly matches: readonly (readonly [number, number])[];
}

export interface MockAnswer {
  readonly query: string;
  readonly includeProposals: boolean;
  readonly proposalsLeftOut: number;
  readonly results: readonly MockHit[];
}

export const repoAiOff: MockAnswer = {
  query: 'Ai session provider',
  includeProposals: false,
  proposalsLeftOut: 1,
  results: [
    {
      id: 'architecture.ai.provider-boundary',
      title: 'AI provider boundary',
      file: 'architecture/ai/provider-boundary.md',
      proposal: false,
      headingPath: ['AI provider boundary', 'Session identity'],
      snippet:
        'Provider session identity is opaque. Application code MUST NOT derive semantics from its string format. A provider-backed session MUST be addressed by the composite `ProviderSessionRef = (provider, providerSessionId)`.…',
      text: 'Provider session identity is opaque. Application code MUST NOT derive semantics from its string format.',
      matches: [
        [0, 8],
        [9, 16],
      ],
    },
    {
      id: 'architecture.ai.canonical-session-turn-work',
      title: 'Canonical AI Session, Turn, and Work model',
      file: 'architecture/ai/canonical-session-turn-work.md',
      proposal: false,
      headingPath: ['Canonical AI Session, Turn, and Work model', 'Hierarchy', 'Session'],
      snippet:
        'A Session represents a provider-backed conversation/execution context. Session is an independent abstraction. Its identity, lifecycle, persistence, history and Turn/Work operations MUST NOT require a Specification, Task or workflow attempt.…',
      text: 'A Session represents a provider-backed conversation/execution context. Session is an independent abstraction.',
      matches: [
        [2, 9],
        [23, 31],
      ],
    },
    {
      id: 'docs.architecture-ai-readme',
      title: 'AI architecture',
      file: 'architecture/ai/README.md',
      proposal: false,
      headingPath: ['AI architecture'],
      snippet:
        '…- [Managed Session persistence and lifecycle](session-storage-and-lifecycle.md) - [Provider process ownership and limits](provider-process-ownership.md) Product presentation belongs under [AI session UX](../../product/specflow/ui/ai-session-ux.md).',
      text: 'Product presentation belongs under AI session UX.',
      matches: [
        [35, 37],
        [38, 45],
      ],
    },
    {
      id: 'reference.providers.claude',
      title: 'Claude Session provider',
      file: 'reference/providers/claude-provider.md',
      proposal: false,
      headingPath: ['Claude Session provider'],
      snippet:
        'Code: `features/sessions/providers/claude/`. Claude runs through the shared Session coordinator, SQLite Worker, authorization and HTTP/SSE/history APIs. There is no provider transcript endpoint, legacy-history import or resume-to-new fallback.',
      text: 'Code: features/sessions/providers/claude/. Claude runs through the shared Session coordinator, SQLite Worker, authorization and HTTP/SSE/history APIs.',
      matches: [
        [15, 23],
        [24, 33],
      ],
    },
    {
      id: 'product.specflow.ui.specification-sessions',
      title: 'Specification Sessions list',
      file: 'product/specflow/ui/specification-sessions.md',
      proposal: false,
      headingPath: [
        'Specification Sessions list',
        'Rows',
        'Status: effective Session readiness only',
      ],
      snippet:
        '…`activeTurn.state` adds no row state and Engine attempt facts never colour a row ([AI session UX](ai-session-ux.md#session-status-ownership-accepted-2026-11-08)). | `readiness` | Status | Tone and icon | | `ready` | none | none |…',
      text: '…Engine attempt facts never colour a row (AI session UX).',
      matches: [
        [42, 44],
        [45, 52],
      ],
    },
    {
      id: 'product.specflow.ui.ai-session-ux',
      title: 'AI session UX',
      file: 'product/specflow/ui/ai-session-ux.md',
      proposal: false,
      headingPath: [
        'AI session UX',
        'Session association vs current execution',
        'Session status ownership (accepted 2026-11-08)',
      ],
      snippet:
        "Muted because the condition is provider-wide and resolved in the provider's CLI, not in the Session; the copy names the provider so it does not read as the Session needing a login. The navigator preview is unchanged and never lists such a Session.…",
      text: "Muted because the condition is provider-wide and resolved in the provider's CLI, not in the Session; the copy names the provider so it does not read as the Session needing a login.",
      matches: [
        [31, 39],
        [92, 99],
      ],
    },
    {
      id: 'reference.providers.antigravity',
      title: 'Antigravity Session provider',
      file: 'reference/providers/antigravity-provider.md',
      proposal: false,
      headingPath: ['Antigravity Session provider'],
      snippet:
        'Code: `features/sessions/providers/antigravity/` plus the shared question transport in `features/sessions/interactions/mcp/`. The adapter uses the existing driver, Engine execution admission and settlement, SQLite lifecycle and HTTP/SSE contracts.…',
      text: 'Code: features/sessions/providers/antigravity/ plus the shared question transport in features/sessions/interactions/mcp/.',
      matches: [
        [15, 23],
        [24, 33],
      ],
    },
    {
      id: 'reference.protocols.session-provider-driver',
      title: 'Session provider driver and invocation protocol',
      file: 'reference/protocols/session-provider-driver.md',
      proposal: false,
      headingPath: ['Session provider driver'],
      snippet:
        "Internal Runtime Sessions port, implemented by the mock, Claude, Codex and Antigravity adapters. Availability remains subject to each adapter's native profile and platform checks ([provider reference](../providers/README.md)). This is not a UI SDK.…",
      text: "Internal Runtime Sessions port, implemented by the mock, Claude, Codex and Antigravity adapters. Availability remains subject to each adapter's native profile and platform checks (provider reference).",
      matches: [
        [17, 25],
        [180, 188],
      ],
    },
    {
      id: 'reference.providers.codex',
      title: 'Codex Session provider',
      file: 'reference/providers/codex-provider.md',
      proposal: false,
      headingPath: ['Codex Session provider', 'Telemetry'],
      snippet:
        'Cumulative tokens, latest native context occupancy/capacity and read-only account-limit refresh (no thread or Turn start or resume); see [Session telemetry](../api/session-telemetry.md).',
      text: '…(no thread or Turn start or resume); see Session telemetry.',
      matches: [[42, 49]],
    },
    {
      id: 'reference.api.session-telemetry',
      title: 'Session telemetry HTTP and live update contract',
      file: 'reference/api/session-telemetry.md',
      proposal: false,
      headingPath: ['Session telemetry API', 'Provider coverage'],
      snippet:
        '…No test uses real subscriptions, credentials or paid inference. Opening a store created before telemetry adds the telemetry tables atomically with the rest of the [schema migration](../../architecture/ai/session-storage-and-lifecycle.md#schema-migration).…',
      text: '…Opening a store created before telemetry adds the telemetry tables atomically with the rest of the schema migration.',
      matches: [],
    },
  ],
};

export const repoAiOn: MockAnswer = {
  query: 'Ai session provider',
  includeProposals: true,
  proposalsLeftOut: 0,
  results: [
    {
      id: 'product.specflow.ui.specification-sessions',
      title: 'Specification Sessions list',
      file: 'product/specflow/ui/specification-sessions.md',
      proposal: false,
      headingPath: [
        'Specification Sessions list',
        'Rows',
        'Status: effective Session readiness only',
      ],
      snippet:
        '…`activeTurn.state` adds no row state and Engine attempt facts never colour a row ([AI session UX](ai-session-ux.md#session-status-ownership-accepted-2026-11-08)). | `readiness` | Status | Tone and icon | | `ready` | none | none |…',
      text: '…Engine attempt facts never colour a row (AI session UX).',
      matches: [
        [42, 44],
        [45, 52],
      ],
    },
    {
      id: 'reference.providers.claude',
      title: 'Claude Session provider',
      file: 'reference/providers/claude-provider.md',
      proposal: false,
      headingPath: ['Claude Session provider'],
      snippet:
        'Code: `features/sessions/providers/claude/`. Claude runs through the shared Session coordinator, SQLite Worker, authorization and HTTP/SSE/history APIs. There is no provider transcript endpoint, legacy-history import or resume-to-new fallback.',
      text: 'Code: features/sessions/providers/claude/. Claude runs through the shared Session coordinator, SQLite Worker, authorization and HTTP/SSE/history APIs.',
      matches: [
        [15, 23],
        [24, 33],
      ],
    },
    {
      id: 'reference.providers.codex',
      title: 'Codex Session provider',
      file: 'reference/providers/codex-provider.md',
      proposal: false,
      headingPath: ['Codex Session provider', 'Telemetry'],
      snippet:
        'Cumulative tokens, latest native context occupancy/capacity and read-only account-limit refresh (no thread or Turn start or resume); see [Session telemetry](../api/session-telemetry.md).',
      text: '…(no thread or Turn start or resume); see Session telemetry.',
      matches: [[42, 49]],
    },
    {
      id: 'docs.reference-providers-readme',
      title: 'Session provider reference',
      file: 'reference/providers/README.md',
      proposal: false,
      headingPath: ['Session provider reference'],
      snippet:
        'All adapters implement the [Session provider driver](../protocols/session-provider-driver.md) and run under [provider process ownership](../../architecture/ai/provider-process-ownership.md).…',
      text: 'All adapters implement the Session provider driver and run under provider process ownership.',
      matches: [
        [27, 34],
        [35, 43],
      ],
    },
    {
      id: 'ideas.specflow-runtime.ai-adapters.session-resume-recovery',
      title: 'Provider session resume and recovery follow-ups',
      file: 'ideas/specflow-runtime/ai-adapters/session-resume-and-recovery.md',
      proposal: true,
      headingPath: ['Provider session resume and recovery follow-ups'],
      snippet:
        '…fallback, and recovery follows [positive evidence](../../../architecture/ai/session-storage-and-lifecycle.md#positive-evidence-and-operator-recovery).',
      text: '…fallback, and recovery follows positive evidence.',
      matches: [],
    },
    {
      id: 'architecture.ai.provider-boundary',
      title: 'AI provider boundary',
      file: 'architecture/ai/provider-boundary.md',
      proposal: false,
      headingPath: ['AI provider boundary', 'Session identity'],
      snippet:
        'Provider session identity is opaque. Application code MUST NOT derive semantics from its string format. A provider-backed session MUST be addressed by the composite `ProviderSessionRef = (provider, providerSessionId)`.…',
      text: 'Provider session identity is opaque. Application code MUST NOT derive semantics from its string format.',
      matches: [
        [0, 8],
        [9, 16],
      ],
    },
    {
      id: 'reference.providers.antigravity',
      title: 'Antigravity Session provider',
      file: 'reference/providers/antigravity-provider.md',
      proposal: false,
      headingPath: ['Antigravity Session provider', 'Questions'],
      snippet:
        'The invocation-private Streamable HTTP MCP server (`ask_user`) binds to loopback on an OS-assigned port with a random bearer credential, bounded requests and waiters and one initialized MCP session per invocation. Runtime and CLI must share the network namespace.…',
      text: '…requests and waiters and one initialized MCP session per invocation.',
      matches: [[46, 53]],
    },
    {
      id: 'architecture.ai.canonical-session-turn-work',
      title: 'Canonical AI Session, Turn, and Work model',
      file: 'architecture/ai/canonical-session-turn-work.md',
      proposal: false,
      headingPath: ['Canonical AI Session, Turn, and Work model', 'Hierarchy', 'Session'],
      snippet:
        'A Session represents a provider-backed conversation/execution context. Session is an independent abstraction. Its identity, lifecycle, persistence, history and Turn/Work operations MUST NOT require a Specification, Task or workflow attempt.…',
      text: 'A Session represents a provider-backed conversation/execution context. Session is an independent abstraction.',
      matches: [
        [2, 9],
        [23, 31],
      ],
    },
    {
      id: 'docs.architecture-ai-readme',
      title: 'AI architecture',
      file: 'architecture/ai/README.md',
      proposal: false,
      headingPath: ['AI architecture'],
      snippet:
        '…- [Managed Session persistence and lifecycle](session-storage-and-lifecycle.md) - [Provider process ownership and limits](provider-process-ownership.md) Product presentation belongs under [AI session UX](../../product/specflow/ui/ai-session-ux.md).',
      text: 'Product presentation belongs under AI session UX.',
      matches: [
        [35, 37],
        [38, 45],
      ],
    },
    {
      id: 'reference.api.session-telemetry',
      title: 'Session telemetry HTTP and live update contract',
      file: 'reference/api/session-telemetry.md',
      proposal: false,
      headingPath: ['Session telemetry API', 'Provider coverage'],
      snippet:
        '…No test uses real subscriptions, credentials or paid inference. Opening a store created before telemetry adds the telemetry tables atomically with the rest of the [schema migration](../../architecture/ai/session-storage-and-lifecycle.md#schema-migration).…',
      text: '…Opening a store created before telemetry adds the telemetry tables atomically with the rest of the schema migration.',
      matches: [],
    },
  ],
};

export const repoErrorsOn: MockAnswer = {
  query: 'provider error limit',
  includeProposals: true,
  proposalsLeftOut: 0,
  results: [
    {
      id: 'ideas.specflow-runtime.ai-adapters.provider-error-examples',
      title: 'Provider error and limit evidence',
      file: 'ideas/specflow-runtime/ai-adapters/provider-error-examples.md',
      proposal: true,
      headingPath: ['Claude-family errors', 'Captured: seven-day rate-limit rejection'],
      snippet:
        '…A long-window limit such as `seven_day` should be considered separately from a burst TPM/RPM throttle. The final canonical distinction between quota and rate-limit should use provider semantics rather than status 429 alone.',
      text: '…canonical distinction between quota and rate-limit should use provider semantics rather than status 429 alone.',
      matches: [
        [46, 51],
        [63, 71],
      ],
    },
    {
      id: 'ideas.specflow-runtime.ai-adapters.error-classification',
      title: 'Quota versus transient rate-limit classification',
      file: 'ideas/specflow-runtime/ai-adapters/error-classification.md',
      proposal: true,
      headingPath: ['Quota versus transient rate-limit classification'],
      snippet:
        'Implemented today: adapters map structured native errors (for example Claude `api_error`, including HTTP 429) to the canonical Turn error vocabulary (`PROVIDER_FAILED`, `PROVIDER_AUTH_REQUIRED`, ...) and exclude native prose ([driver…',
      text: '…Implemented today: adapters map structured native errors (for example Claude api_error, including HTTP 429) to the canonical Turn error vocabulary (PROVIDER_FAILED, PROVIDER_AUTH_REQUIRED, ...) and exclude native prose driver…',
      matches: [
        [51, 57],
        [149, 157],
      ],
    },
    {
      id: 'ideas.specflow-runtime.ai-adapters.provider-capacity-admission',
      title: 'Provider capacity and admission',
      file: 'ideas/specflow-runtime/ai-adapters/provider-capacity-and-admission.md',
      proposal: true,
      headingPath: ['Provider capacity and admission'],
      snippet:
        'Implemented today: provider limit windows are observed as Session telemetry (`limits` group, native push for Claude, read-only refresh for Codex), gated by `session.view-provider-limits` ([telemetry API](../../../reference/api/session-telemetry.md)).…',
      text: 'Implemented today: provider limit windows are observed as Session telemetry (limits group, native push for Claude, read-only refresh for Codex), gated by session.view-provider-limits (telemetry API).',
      matches: [
        [19, 27],
        [28, 33],
      ],
    },
    {
      id: 'reference.providers.antigravity',
      title: 'Antigravity Session provider',
      file: 'reference/providers/antigravity-provider.md',
      proposal: false,
      headingPath: ['Antigravity Session provider', 'Stop continuation and settlement'],
      snippet:
        '…| Cancellation, error, step limit, unknown reason or nonempty `error` | allow termination; disable continuation; never accept idle with work | | Native result already observed | continuation disabled; idle and process settlement still required |…',
      text: '…Cancellation, error, step limit, unknown reason or nonempty error — allow termination; disable continuation; never accept idle with work',
      matches: [
        [15, 20],
        [27, 32],
      ],
    },
    {
      id: 'reference.providers.codex',
      title: 'Codex Session provider',
      file: 'reference/providers/codex-provider.md',
      proposal: false,
      headingPath: ['Codex Session provider', 'Telemetry'],
      snippet:
        'Cumulative tokens, latest native context occupancy/capacity and read-only account-limit refresh (no thread or Turn start or resume); see [Session telemetry](../api/session-telemetry.md).',
      text: '…occupancy/capacity and read-only account-limit refresh (no thread or Turn start or resume); see Session telemetry.',
      matches: [[42, 47]],
    },
    {
      id: 'architecture.ai.provider-boundary',
      title: 'AI provider boundary',
      file: 'architecture/ai/provider-boundary.md',
      proposal: false,
      headingPath: ['AI provider boundary', 'Error normalization'],
      snippet:
        '…- unsupported capability; - rejected or invalid request; - process or transport failure; - timeout, cancellation, or interruption; - provider-reported execution failure. UI/workflow code MUST NOT parse human error strings to decide lifecycle semantics.',
      text: 'provider-reported execution failure. UI/workflow code MUST NOT parse human error strings to decide lifecycle semantics.',
      matches: [
        [0, 8],
        [75, 80],
      ],
    },
    {
      id: 'reference.providers.claude',
      title: 'Claude Session provider',
      file: 'reference/providers/claude-provider.md',
      proposal: false,
      headingPath: ['Claude Session provider', 'Settlement and errors'],
      snippet:
        '…A writer outcome is published only after Engine settles the receipt. Native `api_error` results (including HTTP 429) become safe structured failures; native error prose is excluded. Loss without an authoritative outcome stays unknown.…',
      text: '…Native api_error results (including HTTP 429) become safe structured failures; native error prose is excluded. Loss without an authoritative outcome stays unknown.',
      matches: [[12, 17]],
    },
    {
      id: 'reference.api.session-telemetry',
      title: 'Session telemetry HTTP and live update contract',
      file: 'reference/api/session-telemetry.md',
      proposal: false,
      headingPath: ['Session telemetry API', 'Provider coverage'],
      snippet:
        '…Built-in admin holds `session.view-provider-limits`; developer and viewer do not acquire it implicitly. Trusted local mode retains its existing all-capabilities behavior. | Source | Implemented observations | Explicit refresh |…',
      text: '…Built-in admin holds session.view-provider-limits; developer and viewer do not acquire it implicitly. Trusted local mode retains its existing all-capabilities behavior.',
      matches: [
        [35, 43],
        [44, 50],
      ],
    },
    {
      id: 'ideas.specflow-runtime.ai-adapters',
      title: 'AI adapter hardening ideas',
      file: 'ideas/specflow-runtime/ai-adapters/README.md',
      proposal: true,
      headingPath: ['AI adapter hardening ideas'],
      snippet:
        '…reset, context rotation, positive reconciliation. - [Diagnose API and protocol replay](diagnostics-and-replay.md) — `diagnose()` and the capture-to-replay fixture harness. - [Provider error and limit evidence](provider-error-examples.md) — evidence pack for the items above.…',
      text: 'Provider error and limit evidence — evidence pack for the items above.',
      matches: [
        [0, 8],
        [9, 14],
        [19, 24],
      ],
    },
    {
      id: 'ideas.specflow-runtime.provider-migration-plan',
      title: 'Provider capability backlog',
      file: 'ideas/specflow-runtime/provider-migration-plan.md',
      proposal: true,
      headingPath: [
        'Provider capability backlog',
        'Current scope and capability backlog ownership',
        'F16 — Telemetry coverage and provenance',
      ],
      snippet:
        '…Unqualified Antigravity cost, missing context breakdowns and unproven limit-bucket meanings remain unavailable; API-equivalent cost is not subscription billing. **Impact/direction:** Some UI gauges cannot be populated.…',
      text: '…missing context breakdowns and unproven limit-bucket meanings remain unavailable; API-equivalent cost is not subscription billing.',
      matches: [[41, 46]],
    },
  ],
};

export const repoErrorsOff: MockAnswer = {
  query: 'provider error limit',
  includeProposals: false,
  proposalsLeftOut: 5,
  results: [
    {
      id: 'reference.providers.antigravity',
      title: 'Antigravity Session provider',
      file: 'reference/providers/antigravity-provider.md',
      proposal: false,
      headingPath: ['Antigravity Session provider', 'Stop continuation and settlement'],
      snippet:
        '…| Cancellation, error, step limit, unknown reason or nonempty `error` | allow termination; disable continuation; never accept idle with work | | Native result already observed | continuation disabled; idle and process settlement still required |…',
      text: '…Cancellation, error, step limit, unknown reason or nonempty error — allow termination; disable continuation; never accept idle with work',
      matches: [
        [15, 20],
        [27, 32],
      ],
    },
    {
      id: 'reference.providers.codex',
      title: 'Codex Session provider',
      file: 'reference/providers/codex-provider.md',
      proposal: false,
      headingPath: ['Codex Session provider', 'Telemetry'],
      snippet:
        'Cumulative tokens, latest native context occupancy/capacity and read-only account-limit refresh (no thread or Turn start or resume); see [Session telemetry](../api/session-telemetry.md).',
      text: '…occupancy/capacity and read-only account-limit refresh (no thread or Turn start or resume); see Session telemetry.',
      matches: [[42, 47]],
    },
    {
      id: 'reference.providers.claude',
      title: 'Claude Session provider',
      file: 'reference/providers/claude-provider.md',
      proposal: false,
      headingPath: ['Claude Session provider', 'Settlement and errors'],
      snippet:
        '…A writer outcome is published only after Engine settles the receipt. Native `api_error` results (including HTTP 429) become safe structured failures; native error prose is excluded. Loss without an authoritative outcome stays unknown.…',
      text: '…Native api_error results (including HTTP 429) become safe structured failures; native error prose is excluded. Loss without an authoritative outcome stays unknown.',
      matches: [[12, 17]],
    },
    {
      id: 'architecture.ai.provider-boundary',
      title: 'AI provider boundary',
      file: 'architecture/ai/provider-boundary.md',
      proposal: false,
      headingPath: ['AI provider boundary', 'Error normalization'],
      snippet:
        '…- unsupported capability; - rejected or invalid request; - process or transport failure; - timeout, cancellation, or interruption; - provider-reported execution failure. UI/workflow code MUST NOT parse human error strings to decide lifecycle semantics.',
      text: 'provider-reported execution failure. UI/workflow code MUST NOT parse human error strings to decide lifecycle semantics.',
      matches: [
        [0, 8],
        [75, 80],
      ],
    },
    {
      id: 'reference.api.session-telemetry',
      title: 'Session telemetry HTTP and live update contract',
      file: 'reference/api/session-telemetry.md',
      proposal: false,
      headingPath: ['Session telemetry API', 'Provider coverage'],
      snippet:
        '…Built-in admin holds `session.view-provider-limits`; developer and viewer do not acquire it implicitly. Trusted local mode retains its existing all-capabilities behavior. | Source | Implemented observations | Explicit refresh |…',
      text: '…Built-in admin holds session.view-provider-limits; developer and viewer do not acquire it implicitly. Trusted local mode retains its existing all-capabilities behavior.',
      matches: [
        [35, 43],
        [44, 50],
      ],
    },
    {
      id: 'architecture.ai.provider-process-ownership',
      title: 'Provider process ownership and limits',
      file: 'architecture/ai/provider-process-ownership.md',
      proposal: false,
      headingPath: ['Provider process ownership and limits', 'Streams and framing'],
      snippet:
        '…- The frame limit defaults to 1 MiB and is configurable up to 8 MiB at the adapter boundary. There is no transcript-sized residual buffer or queue of asynchronous per-line handlers. Protocol bytes are never dropped because diagnostic retention is full.…',
      text: 'The frame limit defaults to 1 MiB and is configurable up to 8 MiB at the adapter boundary. There is no transcript-sized residual buffer or queue of asynchronous per-line handlers.',
      matches: [[10, 15]],
    },
    {
      id: 'architecture.runtime.endpoint-policy',
      title: 'Runtime endpoint policy',
      file: 'architecture/runtime/endpoint-policy.md',
      proposal: false,
      headingPath: ['Runtime endpoint policy', 'Admission and response'],
      snippet:
        '…Excess requests return **429** with `error: rate_limited`, `Retry-After`, rate-limit headers and `Cache-Control: no-store`. A fresh configured window restores the budget. Counters are bounded in-memory state (5,000 source keys per store) for one Runtime process.…',
      text: '…Excess requests return 429 with error: rate_limited, Retry-After, rate-limit headers and Cache-Control: no-store. A fresh configured window restores the budget.',
      matches: [
        [33, 38],
        [45, 52],
      ],
    },
    {
      id: 'reference.protocols.session-provider-driver',
      title: 'Session provider driver and invocation protocol',
      file: 'reference/protocols/session-provider-driver.md',
      proposal: false,
      headingPath: ['Session provider driver', 'Failure and settlement'],
      snippet:
        '…Canonical stored Turn error is {code, message}, message <=2 KiB, with code one of PROVIDER_UNAVAILABLE, PROVIDER_AUTH_REQUIRED, REQUEST_INVALID, CAPABILITY_UNSUPPORTED, TRANSPORT_FAILED, PROCESS_FAILED, PROVIDER_FAILED, TIMEOUT, INTERRUPTED, OPERATION_UNKNOWN.…',
      text: '…Canonical stored Turn error is {code, message}, message <=2 KiB, with code one of PROVIDER_UNAVAILABLE, PROVIDER_AUTH_REQUIRED, REQUEST_INVALID, CAPABILITY_UNSUPPORTED, TRANSPORT_FAILED, PROCESS_FAILED, PROVIDER_FAILED, TIMEOUT, INTERRUPTED, OPERATION_UNKNOWN.',
      matches: [
        [23, 28],
        [83, 91],
      ],
    },
    {
      id: 'reference.api.specification-documents',
      title: 'Specification documents HTTP contract',
      file: 'reference/api/specification-documents.md',
      proposal: false,
      headingPath: ['Specification documents HTTP contract', 'Errors'],
      snippet:
        '| `DOCUMENT_UNCOMMITTED_LIMIT` | 409 | Writing would add more than 200 distinct uncommitted paths; commit the pending changes first |',
      text: '…DOCUMENT_UNCOMMITTED_LIMIT — 409 — Writing would add more than 200 distinct uncommitted paths; commit the pending changes first',
      matches: [[22, 27]],
    },
    {
      id: 'docs.reference-providers-readme',
      title: 'Session provider reference',
      file: 'reference/providers/README.md',
      proposal: false,
      headingPath: ['Session provider reference'],
      snippet:
        'All adapters implement the [Session provider driver](../protocols/session-provider-driver.md) and run under [provider process ownership](../../architecture/ai/provider-process-ownership.md).…',
      text: 'All adapters implement the Session provider driver and run under provider process ownership.',
      matches: [[35, 43]],
    },
  ],
};

export const worktreeAiOff: MockAnswer = {
  query: 'Ai session provider',
  includeProposals: false,
  proposalsLeftOut: 1,
  results: [
    {
      id: 'architecture.ai.provider-boundary',
      title: 'AI provider boundary',
      file: 'architecture/ai/provider-boundary.md',
      proposal: false,
      headingPath: ['AI provider boundary', 'Session identity'],
      snippet:
        'Provider session identity is opaque. Application code MUST NOT derive semantics from its string format. A provider-backed session MUST be addressed by the composite `ProviderSessionRef = (provider, providerSessionId)`.…',
      text: 'Provider session identity is opaque. Application code MUST NOT derive semantics from its string format.',
      matches: [
        [0, 8],
        [9, 16],
      ],
    },
    {
      id: 'architecture.ai.canonical-session-turn-work',
      title: 'Canonical AI Session, Turn, and Work model',
      file: 'architecture/ai/canonical-session-turn-work.md',
      proposal: false,
      headingPath: ['Canonical AI Session, Turn, and Work model', 'Hierarchy', 'Session'],
      snippet:
        'A Session represents a provider-backed conversation/execution context. Session is an independent abstraction. Its identity, lifecycle, persistence, history and Turn/Work operations MUST NOT require a Specification, Task or workflow attempt.…',
      text: 'A Session represents a provider-backed conversation/execution context. Session is an independent abstraction.',
      matches: [
        [2, 9],
        [23, 31],
      ],
    },
    {
      id: 'docs.architecture-ai-readme',
      title: 'AI architecture',
      file: 'architecture/ai/README.md',
      proposal: false,
      headingPath: ['AI architecture'],
      snippet:
        '…- [Managed Session persistence and lifecycle](session-storage-and-lifecycle.md) - [Provider process ownership and limits](provider-process-ownership.md) Product presentation belongs under [AI session UX](../../product/specflow/ui/ai-session-ux.md).',
      text: 'Product presentation belongs under AI session UX.',
      matches: [
        [35, 37],
        [38, 45],
      ],
    },
    {
      id: 'reference.providers.claude',
      title: 'Claude Session provider',
      file: 'reference/providers/claude-provider.md',
      proposal: false,
      headingPath: ['Claude Session provider'],
      snippet:
        'Code: `features/sessions/providers/claude/`. Claude runs through the shared Session coordinator, SQLite Worker, authorization and HTTP/SSE/history APIs. There is no provider transcript endpoint, legacy-history import or resume-to-new fallback.',
      text: 'Code: features/sessions/providers/claude/. Claude runs through the shared Session coordinator, SQLite Worker, authorization and HTTP/SSE/history APIs.',
      matches: [
        [15, 23],
        [24, 33],
      ],
    },
    {
      id: 'product.specflow.ui.specification-sessions',
      title: 'Specification Sessions list',
      file: 'product/specflow/ui/specification-sessions.md',
      proposal: false,
      headingPath: [
        'Specification Sessions list',
        'Rows',
        'Status: effective Session readiness only',
      ],
      snippet:
        '…`activeTurn.state` adds no row state and Engine attempt facts never colour a row ([AI session UX](ai-session-ux.md#session-status-ownership-accepted-2026-11-08)). | `readiness` | Status | Tone and icon | | `ready` | none | none |…',
      text: '…Engine attempt facts never colour a row (AI session UX).',
      matches: [
        [42, 44],
        [45, 52],
      ],
    },
    {
      id: 'product.specflow.ui.ai-session-ux',
      title: 'AI session UX',
      file: 'product/specflow/ui/ai-session-ux.md',
      proposal: false,
      headingPath: [
        'AI session UX',
        'Session association vs current execution',
        'Session status ownership (accepted 2026-11-08)',
      ],
      snippet:
        "Muted because the condition is provider-wide and resolved in the provider's CLI, not in the Session; the copy names the provider so it does not read as the Session needing a login. The navigator preview is unchanged and never lists such a Session.…",
      text: "Muted because the condition is provider-wide and resolved in the provider's CLI, not in the Session; the copy names the provider so it does not read as the Session needing a login.",
      matches: [
        [31, 39],
        [92, 99],
      ],
    },
    {
      id: 'reference.providers.antigravity',
      title: 'Antigravity Session provider',
      file: 'reference/providers/antigravity-provider.md',
      proposal: false,
      headingPath: ['Antigravity Session provider'],
      snippet:
        'Code: `features/sessions/providers/antigravity/` plus the shared question transport in `features/sessions/interactions/mcp/`. The adapter uses the existing driver, Engine execution admission and settlement, SQLite lifecycle and HTTP/SSE contracts.…',
      text: 'Code: features/sessions/providers/antigravity/ plus the shared question transport in features/sessions/interactions/mcp/.',
      matches: [
        [15, 23],
        [24, 33],
      ],
    },
    {
      id: 'reference.protocols.session-provider-driver',
      title: 'Session provider driver and invocation protocol',
      file: 'reference/protocols/session-provider-driver.md',
      proposal: false,
      headingPath: ['Session provider driver'],
      snippet:
        "Internal Runtime Sessions port, implemented by the mock, Claude, Codex and Antigravity adapters. Availability remains subject to each adapter's native profile and platform checks ([provider reference](../providers/README.md)). This is not a UI SDK.…",
      text: "Internal Runtime Sessions port, implemented by the mock, Claude, Codex and Antigravity adapters. Availability remains subject to each adapter's native profile and platform checks (provider reference).",
      matches: [
        [17, 25],
        [180, 188],
      ],
    },
    {
      id: 'reference.providers.codex',
      title: 'Codex Session provider',
      file: 'reference/providers/codex-provider.md',
      proposal: false,
      headingPath: ['Codex Session provider', 'Telemetry'],
      snippet:
        'Cumulative tokens, latest native context occupancy/capacity and read-only account-limit refresh (no thread or Turn start or resume); see [Session telemetry](../api/session-telemetry.md).',
      text: '…(no thread or Turn start or resume); see Session telemetry.',
      matches: [[42, 49]],
    },
    {
      id: 'reference.api.session-telemetry',
      title: 'Session telemetry HTTP and live update contract',
      file: 'reference/api/session-telemetry.md',
      proposal: false,
      headingPath: ['Session telemetry API', 'Provider coverage'],
      snippet:
        '…No test uses real subscriptions, credentials or paid inference. Opening a store created before telemetry adds the telemetry tables atomically with the rest of the [schema migration](../../architecture/ai/session-storage-and-lifecycle.md#schema-migration).…',
      text: '…Opening a store created before telemetry adds the telemetry tables atomically with the rest of the schema migration.',
      matches: [],
    },
  ],
};

export const repoNonsense: MockAnswer = {
  query: 'zzzqqq',
  includeProposals: false,
  proposalsLeftOut: 1,
  results: [
    {
      id: 'reference.providers.antigravity',
      title: 'Antigravity Session provider',
      file: 'reference/providers/antigravity-provider.md',
      proposal: false,
      headingPath: ['Antigravity Session provider', 'Questions'],
      snippet:
        'The invocation-private Streamable HTTP MCP server (`ask_user`) binds to loopback on an OS-assigned port with a random bearer credential, bounded requests and waiters and one initialized MCP session per invocation. Runtime and CLI must share the network namespace.…',
      text: 'The invocation-private Streamable HTTP MCP server (ask_user) binds to loopback on an OS-assigned port with a random bearer credential, bounded requests and waiters and one initialized MCP session per invocation.',
      matches: [],
    },
    {
      id: 'reference.api.specs-overview',
      title: 'Specs Overview HTTP API',
      file: 'reference/api/specs-overview.md',
      proposal: false,
      headingPath: ['Specs Overview HTTP API', 'Project mode: what a row is made of'],
      snippet:
        'Requires attention, Active and Ready are therefore not reachable in project mode until such sources exist.',
      text: 'Requires attention, Active and Ready are therefore not reachable in project mode until such sources exist.',
      matches: [],
    },
    {
      id: 'reference.api.sessions',
      title: 'Managed Sessions HTTP and read-model contract',
      file: 'reference/api/sessions.md',
      proposal: false,
      headingPath: ['Managed Sessions API', 'Routes and commands'],
      snippet:
        'Respond answer text <=16 KiB, option IDs must be declared, duplicate option IDs invalid; text only when allowText; an optional maxSelections (1 to 20) limits selected option IDs (absent means 1, single-select) and is checked before durable response admission.…',
      text: 'Respond answer text <=16 KiB, option IDs must be declared, duplicate option IDs invalid; text only when allowText; an optional maxSelections (1 to 20) limits selected option IDs (absent means 1, single-select) and is checked before durable response admission.',
      matches: [],
    },
    {
      id: 'reference.api.specs-operations-list',
      title: 'Specifications operation list HTTP API',
      file: 'reference/api/specs-operations-list.md',
      proposal: false,
      headingPath: ['Specifications operation list HTTP API', 'Status derivation'],
      snippet:
        '| Journal | Registry (this process) | Row | | `completed` | any | `completed`, `finishedAt` = registry or file time; listed for 10 min, at most 5 rows | | `recovery-required` | any | `recovery-required` |…',
      text: '…completed — any — completed, finishedAt = registry or file time; listed for 10 min, at most 5 rows',
      matches: [],
    },
    {
      id: 'reference.providers.claude',
      title: 'Claude Session provider',
      file: 'reference/providers/claude-provider.md',
      proposal: false,
      headingPath: ['Claude Session provider', 'Settlement and errors'],
      snippet:
        'Terminal facts are held until the process owner has stopped the tree; a protocol outcome with unverified settlement stays unknown. Abort with positive settlement becomes cancelled or interrupted.…',
      text: 'Terminal facts are held until the process owner has stopped the tree; a protocol outcome with unverified settlement stays unknown. Abort with positive settlement becomes cancelled or interrupted.',
      matches: [],
    },
    {
      id: 'product.specflow.ui.ai-session-ux',
      title: 'AI session UX',
      file: 'product/specflow/ui/ai-session-ux.md',
      proposal: false,
      headingPath: ['AI session UX'],
      snippet:
        '`status: draft` — working guidance, expanded as the code it governs lands. The concrete, implemented Session screen rules are the [Full Session](full-session.md) contract.',
      text: '…The concrete, implemented Session screen rules are the Full Session contract.',
      matches: [],
    },
    {
      id: 'reference.cli.nevo-specflow-docs',
      title: 'nevo-specflow docs commands',
      file: 'reference/cli/nevo-specflow-docs.md',
      proposal: false,
      headingPath: ['`nevo-specflow docs` commands', '`search`'],
      snippet:
        '| `reason.code` | When | | `semantic-disabled` | `docs.search.semantic` is absent or `false` | | `no-endpoint` | semantic search is enabled but `ai.embeddings` is not configured |…',
      text: '…no-endpoint — semantic search is enabled but ai.embeddings is not configured',
      matches: [],
    },
    {
      id: 'reference.api.workspace-docs',
      title: 'Workspace documentation HTTP API',
      file: 'reference/api/workspace-docs.md',
      proposal: false,
      headingPath: [
        'Workspace documentation HTTP API',
        'GET /api/workspaces/:workspaceId/docs/documents/:documentId',
      ],
      snippet:
        'A section is opened by its `sectionId`. Search `line`s count in the file (frontmatter included); article `sections[].line` counts in `body`. The document refusals: | Status | Code | When |…',
      text: '…Search lines count in the file (frontmatter included); article sections[].line counts in body. The document refusals:',
      matches: [],
    },
    {
      id: 'adr.0021-product-neutral-ai-semantic-search-engine',
      title: 'Product-neutral AI semantic search engine',
      file: 'architecture/decisions/0021-product-neutral-ai-semantic-search-engine.md',
      proposal: false,
      headingPath: [
        '0021 — Product-neutral AI semantic search engine',
        'Decision',
        '6. Local index',
      ],
      snippet:
        '- Content freshness and the embedding identity are checked separately. The freshness check compares chunk ids and content hashes with the manifest and calls no endpoint; without configured dimensions it takes the stored dimension as given.…',
      text: '…The freshness check compares chunk ids and content hashes with the manifest and calls no endpoint; without configured dimensions it takes the stored dimension as given.',
      matches: [],
    },
    {
      id: 'reference.providers.codex',
      title: 'Codex Session provider',
      file: 'reference/providers/codex-provider.md',
      proposal: false,
      headingPath: ['Codex Session provider', 'Authentication'],
      snippet:
        "- Supported login: the installed CLI's ChatGPT file login. API-key and machine-managed authentication are unavailable. - **Only the original CLI owns refresh authority.** The private home receives current access/ID…",
      text: 'Only the original CLI owns refresh authority. The private home receives current access/ID…',
      matches: [],
    },
  ],
};
