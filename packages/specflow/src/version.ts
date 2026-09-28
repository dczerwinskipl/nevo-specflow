// The installed CLI carries its own version — it does NOT read the repository's
// `version.json` at runtime. `NEVO_SPECFLOW_VERSION_INJECTED` is replaced at
// bundle time by the packaging tool, sourced from `nevo-release version`.

declare const NEVO_SPECFLOW_VERSION_INJECTED: string | undefined;

export const NEVO_SPECFLOW_VERSION: string =
  typeof NEVO_SPECFLOW_VERSION_INJECTED === 'string'
    ? NEVO_SPECFLOW_VERSION_INJECTED
    : '0.0.0';
