// Writes or checks the committed Runtime OpenAPI reference document
// (`docs/reference/api/openapi.generated.json`). Run through `pnpm api:openapi [--check]`.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { RuntimeConfig } from './config/types';
import { createRuntimeApp } from './server/app';
import { generateOpenApiDocument, openApiRouteGaps } from './server/openapi';

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

/** The document bytes: paths sorted, 2-space indentation, LF line endings, trailing newline. */
async function renderReferenceDocument(): Promise<{ text: string; gaps: readonly string[] }> {
  const app = await createRuntimeApp(referenceConfig(), { dataMode: 'project' });
  try {
    const document = await generateOpenApiDocument(app);
    const paths = document.paths as Record<string, unknown>;
    const sortedPaths = Object.fromEntries(
      Object.keys(paths)
        .sort()
        .map((path) => [path, paths[path]]),
    );
    const text = `${JSON.stringify({ ...document, paths: sortedPaths }, null, 2)}\n`;

    return {
      text,
      gaps: openApiRouteGaps(app).map((gap) => `${gap.method} ${gap.url}`),
    };
  } finally {
    await app.close();
  }
}

async function main(args: readonly string[]): Promise<number> {
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
    process.stderr.write(`Usage: pnpm api:openapi [--check]\n`);

    return 2;
  }

  const check = args[0] === '--check';
  const { text, gaps } = await renderReferenceDocument();
  if (gaps.length > 0) {
    process.stderr.write(
      `Routes without a response schema (documented as "Default Response"):\n${gaps
        .map((gap) => `  ${gap}\n`)
        .join('')}`,
    );
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

// Runs only as the command; importing the module (the package build's surface check) does nothing.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
