import { useTranslation } from 'react-i18next';
import { cn, choiceSurfaceClassName, Icon, Typography } from '@nevo/ui';
import { ApplicationContextLine } from '../../../app/navigation/ApplicationLocation';

/** First step of a new specification: write it with an agent or by hand. */
export function CreateMethodChoice({ onChoose }: { onChoose: (method: 'ai' | 'manual') => void }) {
  const { t } = useTranslation();
  const items = [
    {
      id: 'ai' as const,
      title: t('create.withAI'),
      icon: 'chat' as const,
      text: t('create.method.aiText'),
    },
    {
      id: 'manual' as const,
      title: t('create.manual'),
      icon: 'file' as const,
      text: t('create.method.manualText'),
    },
  ];
  return (
    <div className="grid gap-6">
      <ApplicationContextLine className="mb-0" view="new-specification" />
      <header className="grid gap-2">
        <Typography as="h1" variant="title-lg">
          {t('create.method.title')}
        </Typography>
        <Typography as="p" variant="body-md" className="text-content-secondary">
          {t('create.method.intro')}
        </Typography>
      </header>
      <div className="grid items-stretch gap-4 @2xl:grid-cols-2">
        {items.map((item) => (
          <button
            type="button"
            key={item.id}
            className={cn(choiceSurfaceClassName, 'grid')}
            onClick={() => onChoose(item.id)}
          >
            <span className="flex items-start gap-3">
              <Icon name={item.icon} className="text-status-info" />
              <span className="min-w-0 break-words">
                <strong className="block text-title-sm">{item.title}</strong>
                <span className="mt-1 block text-body-sm text-content-secondary">{item.text}</span>
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
