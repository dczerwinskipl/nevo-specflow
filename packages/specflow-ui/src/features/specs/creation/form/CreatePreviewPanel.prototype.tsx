import { FileText } from 'lucide-react';
import { Separator, Typography } from '@nevo/ui';
import type { ArchetypeInfo } from '@nevo/specflow-contracts/documents';
import { useTranslation } from 'react-i18next';
import type { Tile } from '../workspace/model/workspaceChoice';

/**
 * PROTOTYPE ONLY (variant E of the App Shell geometry review, not for merge).
 * The Create form's Secondary: a read-only preview of the Specification the form will create,
 * built only from values the form already holds.
 */
const tileKey = {
  new: 'createPreviewPrototype.tileNew',
  main: 'createPreviewPrototype.tileMain',
  existing: 'createPreviewPrototype.tileExisting',
} as const satisfies Record<Tile, string>;

/** The two Agent choice fields the preview shows (kept local: a prototype must not reach into Sessions). */
interface PreviewAgent {
  readonly providerId: string;
  readonly modelId: string;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <Typography as="div" variant="section-label">
        {label}
      </Typography>
      <div className="text-body-sm text-content-primary">{children}</div>
    </div>
  );
}

export function CreatePreviewPanel({
  title,
  archetype,
  documents,
  agent,
  tile,
}: {
  title?: string;
  archetype?: ArchetypeInfo;
  documents?: readonly string[];
  agent?: PreviewAgent;
  tile?: Tile | null;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-5 px-4 py-5">
      <Row label={t('createPreviewPrototype.specification')}>
        {title?.trim() ? (
          title.trim()
        ) : (
          <span className="text-content-secondary">{t('createPreviewPrototype.namePending')}</span>
        )}
      </Row>
      {archetype ? (
        <Row label={t('createPreviewPrototype.archetype')}>{archetype.title}</Row>
      ) : null}
      {documents ? (
        <Row label={t('createPreviewPrototype.documents')}>
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {documents.map((file) => (
              <li key={file} className="flex items-center gap-2 font-mono text-body-sm">
                <FileText aria-hidden className="size-4 shrink-0 text-content-secondary" />
                {file}
              </li>
            ))}
          </ul>
        </Row>
      ) : null}
      {agent ? (
        <>
          <Separator />
          <Row label={t('createPreviewPrototype.firstSession')}>
            {agent.providerId.charAt(0).toUpperCase() + agent.providerId.slice(1)}
            <span className="text-content-secondary">
              {' · '}
              {agent.modelId || t('createPreviewPrototype.modelPending')}
            </span>
          </Row>
        </>
      ) : null}
      {tile ? <Row label={t('createPreviewPrototype.place')}>{t(tileKey[tile])}</Row> : null}
      {!archetype && !agent ? (
        <Typography as="p" variant="body-sm" className="text-content-secondary">
          {t('createPreviewPrototype.choosePrompt')}
        </Typography>
      ) : null}
    </div>
  );
}
