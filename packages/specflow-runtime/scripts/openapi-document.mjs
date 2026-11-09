// `pnpm api:openapi [--check]`: runs the built command (the root script builds the package first).
import { runOpenApiDocumentCommand } from '../dist/openapi-document.js';

process.exitCode = await runOpenApiDocumentCommand(process.argv.slice(2));
