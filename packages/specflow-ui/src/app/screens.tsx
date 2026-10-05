import {
  AppContent,
  AppContentContainer,
  AppWorkspace,
  AppWorkspaceBody,
  Button,
  Card,
  TextInput,
  Typography,
  WorkspaceHeader,
} from '@nevo/ui';
import { useTranslation } from 'react-i18next';

function Screen({ children, title }: { children: React.ReactNode; title: string }) {
  const { t } = useTranslation();

  return (
    <AppWorkspace
      labels={{
        backToPrimary: t('navigation.back'),
        closeSecondary: t('navigation.closeSecondary'),
        openNavigation: t('navigation.open'),
      }}
      split="primary"
    >
      <AppWorkspace.Primary header={<WorkspaceHeader title={title} />}>
        <AppContent>
          <AppWorkspaceBody>
            <AppContentContainer className="grid gap-5" size="wide">
              {children}
            </AppContentContainer>
          </AppWorkspaceBody>
        </AppContent>
      </AppWorkspace.Primary>
    </AppWorkspace>
  );
}

export function HomeScreen() {
  const { t } = useTranslation();

  return (
    <Screen title={t('home.title')}>
      <div className="grid gap-2">
        <Typography as="h1" variant="title-lg">
          Nevo SpecFlow
        </Typography>
        <Typography className="max-w-2xl text-content-secondary" variant="body-lg">
          {t('home.description')}
        </Typography>
      </div>
      <Card>
        <Card.Header>
          <Typography as="h2" variant="title-sm">
            {t('home.foundationTitle')}
          </Typography>
        </Card.Header>
        <Card.Body>
          <Typography className="text-content-secondary" variant="body-md">
            {t('home.foundationDescription')}
          </Typography>
        </Card.Body>
      </Card>
    </Screen>
  );
}

export function UiPlaygroundScreen() {
  const { t } = useTranslation();

  return (
    <Screen title={t('playground.title')}>
      <Typography className="text-content-secondary" variant="body-md">
        {t('playground.description')}
      </Typography>
      <div className="flex max-w-xl flex-wrap items-center gap-3">
        <TextInput aria-label={t('playground.exampleValue')} defaultValue="SpecFlow" />
        <Button>{t('playground.continue')}</Button>
      </div>
    </Screen>
  );
}
