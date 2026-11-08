import { discoveryTool, parseDiscoveryRequest, type DiscoveryRequest } from './contract';
import { emptyDiscoveryResult, scanDiscovery } from './scan';
import { openWindowsDiscoveryWorkspace } from './windows-reader';

/** Fixed helper entry, executed only in an owned disposable process. Never a shell. */
export function runAntigravityDiscovery(input: string) {
  try {
    const body = JSON.parse(input) as {
      workspace?: unknown;
      tool?: unknown;
      request?: DiscoveryRequest;
    };
    if (
      !body ||
      typeof body !== 'object' ||
      Object.keys(body).sort().join(',') !== 'request,tool,workspace' ||
      typeof body.workspace !== 'string' ||
      !discoveryTool(body.tool) ||
      !body.request
    ) {
      throw new Error('Invalid discovery request.');
    }

    // Revalidate the helper boundary. Drop canonical default fields not owned by
    // the selected tool before applying its strict public argument schema.
    const {
      path,
      includes,
      excludes,
      maxDepth,
      pattern,
      type,
      query,
      caseInsensitive,
      matchPerLine,
    } = body.request;
    const request = parseDiscoveryRequest(body.tool, {
      path,
      includes,
      excludes,
      ...(body.tool !== 'list_directory' ? { maxDepth } : {}),
      ...(body.tool === 'find_files' ? { pattern, type } : {}),
      ...(body.tool === 'search_text' ? { query, caseInsensitive, matchPerLine } : {}),
    });
    const reader = openWindowsDiscoveryWorkspace(body.workspace);
    try {
      return scanDiscovery(reader, body.tool, request);
    } finally {
      reader.close();
    }
  } catch {
    return emptyDiscoveryResult('failed', 'discovery-workspace-or-request-unavailable');
  }
}
