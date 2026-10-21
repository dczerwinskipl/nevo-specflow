import { Icon } from '@nevo/ui';
import codex from './provider-icons/codex.svg?url';
import claude from './provider-icons/claude-color.svg?url';

const providerIcons: Readonly<Record<string, { url: string; kind: 'color' | 'mono' }>> = {
  codex: { url: codex, kind: 'mono' },
  claude: { url: claude, kind: 'color' },
};

/** Provider identity is supplied by the association, never inferred from its title or role. */
export function SessionProviderIcon({ providerId }: { readonly providerId?: string }) {
  const asset = providerId ? providerIcons[providerId] : undefined;
  if (!asset)
    return (
      <span aria-hidden="true" className="inline-flex size-4 shrink-0 items-center justify-center">
        <Icon name="chat" size="sm" />
      </span>
    );
  if (asset.kind === 'color')
    return (
      <img src={asset.url} alt="" aria-hidden="true" className="size-4 shrink-0 object-contain" />
    );
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-4 shrink-0 bg-current"
      style={{
        maskImage: `url("${asset.url}")`,
        maskSize: 'contain',
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
      }}
    />
  );
}
