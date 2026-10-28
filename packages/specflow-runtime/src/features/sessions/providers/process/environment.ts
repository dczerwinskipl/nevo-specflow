export interface ProviderEnvironment {
  readonly values: Readonly<Record<string, string>>;
  /** Names and sources only: values must never become telemetry. */
  readonly sources: Readonly<
    Record<string, 'platform' | 'inherited' | 'configured' | 'secret' | 'runtime'>
  >;
}
const windowsBase = [
  'PATH',
  'PATHEXT',
  'SYSTEMROOT',
  'WINDIR',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'TEMP',
  'TMP',
];
const posixBase = ['PATH', 'HOME', 'TMPDIR'];
const reserved = (key: string) => key.toUpperCase().startsWith('NEVO_');

/** The same projection is used for discovery and execution; never merge ambient process.env. */
export function projectProviderEnvironment(options: {
  host: Readonly<Record<string, string | undefined>>;
  platform?: NodeJS.Platform;
  inherit?: readonly string[];
  configured?: Readonly<Record<string, string>>;
  secrets?: Readonly<Record<string, string>>;
  runtime?: Readonly<Record<string, string>>;
}): ProviderEnvironment {
  const windows = (options.platform ?? process.platform) === 'win32';
  const values: Record<string, string> = Object.create(null) as Record<string, string>;
  const sources: Record<string, 'platform' | 'inherited' | 'configured' | 'secret' | 'runtime'> =
    Object.create(null) as typeof sources;
  const normalize = (key: string) => (windows ? key.toUpperCase() : key);
  function put(key: string, value: string, source: (typeof sources)[string]) {
    if (
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ||
      value.includes('\0') ||
      Buffer.byteLength(value) > 32768
    )
      throw new Error('Invalid provider environment entry.');
    if (reserved(key) !== (source === 'runtime'))
      throw new Error('Reserved provider environment entry.');
    const name = normalize(key);
    values[name] = value;
    sources[name] = source;
  }
  function inherit(keys: readonly string[], source: 'platform' | 'inherited') {
    for (const key of keys) {
      if (reserved(key)) throw new Error('Reserved inherited provider environment entry.');
      const matches = Object.keys(options.host).filter(
        (k) => normalize(k) === normalize(key) && options.host[k] !== undefined,
      );
      const distinct = new Set(matches.map((k) => options.host[k]));
      if (distinct.size > 1) throw new Error('Ambiguous provider environment casing.');
      if (matches[0]) put(key, options.host[matches[0]]!, source);
    }
  }
  inherit(windows ? windowsBase : posixBase, 'platform');
  inherit(options.inherit ?? [], 'inherited');
  for (const [key, value] of Object.entries(options.configured ?? {}))
    put(key, value, 'configured');
  for (const [key, value] of Object.entries(options.secrets ?? {})) put(key, value, 'secret');
  for (const [key, value] of Object.entries(options.runtime ?? {})) put(key, value, 'runtime');
  if (Buffer.byteLength(JSON.stringify(values)) > 128 * 1024)
    throw new Error('Provider environment exceeds its byte budget.');
  return { values: Object.freeze(values), sources: Object.freeze(sources) };
}
