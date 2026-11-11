// Writes or checks the committed Runtime OpenAPI reference document
// (`docs/reference/api/openapi.generated.json`). Run through `pnpm api:openapi [--check]`.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { RuntimeConfig } from './config/types';
import { createRuntimeApp } from './server/app';
import {
  generateOpenApiDocument,
  openApiRouteGaps,
  type RuntimeOpenApiDocument,
} from './server/openapi';

const DOCUMENT_FILE = 'docs/reference/api/openapi.generated.json';
// `src/` and `dist/` are both one level below the package, two levels below the repository root.
const documentPath = fileURLToPath(new URL(`../../../${DOCUMENT_FILE}`, import.meta.url));

/**
 * The canonical project-mode composition of the committed document: required authentication with
 * every authentication provider enabled (password and one OIDC provider with id `example`), no
 * Engine and no demo. The route surface of project mode depends only on the enabled providers, so
 * this composition documents all of it. Nothing is read from the workstation, no listener is
 * started and no network is used (OIDC discovery runs only on a login request).
 */
function referenceConfig(): RuntimeConfig {
  return {
    server: {
      host: '127.0.0.1',
      port: 4318,
      publicOrigin: 'https://specflow.example.test',
      tls: { enabled: true, certFile: 'cert.pem', keyFile: 'key.pem' },
    },
    authentication: {
      mode: 'required',
      users: { reference: { name: 'Reference User' } },
      providers: {
        password: { enabled: true, accounts: {} },
        oidc: {
          instances: {
            example: {
              name: 'Example SSO',
              enabled: true,
              issuer: 'https://issuer.example.test',
              clientId: 'client-id',
              clientSecret: 'client-secret',
              allowedEmails: {},
            },
          },
        },
      },
    },
  };
}

/**
 * Validates a document as OpenAPI 3.1 (schema conformance, which includes required path
 * parameters, and resolvable `$ref`s) and returns its problems. The command takes it as an argument
 * so the validator stays a development dependency of the command script and never reaches the
 * Runtime build.
 */
export type OpenApiValidator = (document: RuntimeOpenApiDocument) => Promise<readonly string[]>;

/**
 * Path template parameters without a declared path parameter, and declared path parameters
 * without a template parameter. OpenAPI requires both to match; schema validation cannot see it.
 */
export function pathParameterProblems(document: RuntimeOpenApiDocument): string[] {
  const problems: string[] = [];
  const paths = document.paths as Record<
    string,
    Record<string, { parameters?: readonly { in: string; name: string }[] }>
  >;
  for (const [path, operations] of Object.entries(paths)) {
    const template = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]!).sort();
    for (const [method, operation] of Object.entries(operations)) {
      const declared = (operation.parameters ?? [])
        .filter((parameter) => parameter.in === 'path')
        .map((parameter) => parameter.name)
        .sort();
      if (template.join('/') !== declared.join('/')) {
        problems.push(
          `${method.toUpperCase()} ${path} declares path parameters [${declared.join(', ')}].`,
        );
      }
    }
  }

  return problems;
}

/** The document bytes: paths sorted, 2-space indentation, LF line endings, trailing newline. */
async function renderReferenceDocument(
  validate: OpenApiValidator,
): Promise<{ text: string; gaps: readonly string[]; problems: readonly string[] }> {
  const app = await createRuntimeApp(referenceConfig(), { dataMode: 'project' });
  try {
    const document = await generateOpenApiDocument(app);
    const paths = document.paths as Record<string, unknown>;
    const sortedPaths = Object.fromEntries(
      Object.keys(paths)
        .sort()
        .map((path) => [path, paths[path]]),
    );
    const sorted = { ...document, paths: sortedPaths };

    return {
      text: `${JSON.stringify(sorted, null, 2)}\n`,
      problems: [...(await validate(sorted)), ...pathParameterProblems(sorted)],
      gaps: openApiRouteGaps(app).map((gap) => `${gap.method} ${gap.url}`),
    };
  } finally {
    await app.close();
  }
}

/**
 * The `pnpm api:openapi [--check]` command; returns its exit code. Both modes validate the
 * document first. The module has no import side effects (the package build imports it);
 * `scripts/openapi-document.mjs` runs it with the OpenAPI 3.1 validator.
 */
export async function runOpenApiDocumentCommand(
  args: readonly string[],
  validate: OpenApiValidator,
): Promise<number> {
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
    process.stderr.write(`Usage: pnpm api:openapi [--check]\n`);

    return 2;
  }

  const check = args[0] === '--check';
  const { text, gaps, problems } = await renderReferenceDocument(validate);
  if (gaps.length > 0) {
    process.stderr.write(
      `Routes without documented responses (documented as "Default Response"):\n${gaps
        .map((gap) => `  ${gap}\n`)
        .join('')}`,
    );
  }

  // An invalid document is neither written nor accepted as current.
  if (problems.length > 0) {
    process.stderr.write(
      `The generated OpenAPI document is invalid:\n${problems
        .map((problem) => `  ${problem}\n`)
        .join('')}`,
    );

    return 1;
  }

  if (!check) {
    await writeFile(documentPath, text, 'utf8');
    process.stdout.write(`Wrote ${DOCUMENT_FILE}\n`);

    return 0;
  }

  const committed = await readFile(documentPath, 'utf8').catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }

    throw error;
  });
  if (committed !== text) {
    process.stderr.write(`${DOCUMENT_FILE} is stale: run \`pnpm api:openapi\`.\n`);

    return 1;
  }

  process.stdout.write(`${DOCUMENT_FILE} is current.\n`);

  return 0;
}
