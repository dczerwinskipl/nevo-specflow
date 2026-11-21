/** A browser and system read from a user agent, for people to recognise a device by. */
export interface DeviceName {
  readonly browser?: string;
  readonly system?: string;
  /** Phones and tablets: where a QR code is scanned. */
  readonly handheld: boolean;
}

const has = (agent: string, ...parts: readonly string[]) =>
  parts.some((part) => agent.includes(part));

/**
 * The user agent is a claim of the browser, not a fact: it helps the owner recognise a device and
 * is never proof of one (the approval copy says so).
 */
export function readDeviceName(userAgent: string | undefined): DeviceName {
  const agent = userAgent ?? '';
  const browser = has(agent, 'Edg/', 'EdgA/', 'EdgiOS/', 'Edge/')
    ? 'Edge'
    : has(agent, 'OPR/', 'Opera')
      ? 'Opera'
      : has(agent, 'Firefox/', 'FxiOS/')
        ? 'Firefox'
        : has(agent, 'Chrome/', 'CriOS/')
          ? 'Chrome'
          : has(agent, 'Safari/')
            ? 'Safari'
            : undefined;
  const system = has(agent, 'iPhone')
    ? 'iPhone'
    : has(agent, 'iPad')
      ? 'iPad'
      : has(agent, 'Android')
        ? 'Android'
        : has(agent, 'Windows')
          ? 'Windows'
          : has(agent, 'Mac OS X', 'Macintosh')
            ? 'macOS'
            : has(agent, 'CrOS')
              ? 'ChromeOS'
              : has(agent, 'Linux', 'X11')
                ? 'Linux'
                : undefined;

  return {
    ...(browser ? { browser } : {}),
    ...(system ? { system } : {}),
    handheld: system === 'iPhone' || system === 'iPad' || system === 'Android',
  };
}
