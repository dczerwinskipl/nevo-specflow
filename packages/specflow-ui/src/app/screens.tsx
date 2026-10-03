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

function Screen({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <AppWorkspace split="primary">
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
  return (
    <Screen title="Home">
      <div className="grid gap-2">
        <Typography as="h1" variant="title-lg">
          Nevo SpecFlow
        </Typography>
        <Typography className="max-w-2xl text-content-secondary" variant="body-lg">
          The product frontend boundary is ready for real SpecFlow features.
        </Typography>
      </div>
      <Card>
        <Card.Header>
          <Typography as="h2" variant="title-sm">
            Migration foundation
          </Typography>
        </Card.Header>
        <Card.Body>
          <Typography className="text-content-secondary" variant="body-md">
            Routing, the application shell, Nevo branding, and reusable Nevo UI are composed here
            without placeholder domain data.
          </Typography>
        </Card.Body>
      </Card>
    </Screen>
  );
}

export function UiPlaygroundScreen() {
  return (
    <Screen title="UI Playground">
      <Typography className="text-content-secondary" variant="body-md">
        A neutral product-owned surface for checking Nevo UI composition inside the real app.
      </Typography>
      <div className="flex max-w-xl flex-wrap items-center gap-3">
        <TextInput aria-label="Example value" defaultValue="SpecFlow" />
        <Button>Continue</Button>
      </div>
    </Screen>
  );
}
