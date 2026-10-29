import { useId, useState, type ReactNode } from 'react';
import {
  AppContent,
  AppContentContainer,
  AppShell,
  AppWorkspace,
  AppWorkspaceBody,
  Button,
  CheckboxField,
  Collapsible,
  DescriptionList,
  Field,
  InlineNote,
  RadioGroup,
  RadioGroupOption,
  Separator,
  TextArea,
  TextInput,
  Typography,
  WorkspaceHeader,
} from '@nevo/ui';
import { StoryLocalization } from '../../i18n/StoryLocalization';
import { SummaryRow } from '../../features/specs/creation/workspace/WorkspaceTileSummaries';
import {
  archetypes,
  documentTypes,
  ownerFeature,
  typeTitle,
  type MockArchetype,
} from './fixtures.stories-support';

/*
 * PRESENTATION MOCK ONLY. The Create form of a project Runtime with the new Archetype section, and
 * the Configuration block of the progress page with the two new rows. Hand-composed with the real
 * CreateShell geometry (AppWorkspace fit="bounded", content-standard / content-narrow); the
 * workspace-place section is unchanged and only stubbed here.
 */

export type CreateScenario = 'form' | 'feature' | 'owner-requirement' | 'progress';

export interface CreateMockProps {
  width: number;
  height?: number;
  scenario: CreateScenario;
}

function ArchetypeSection({ catalogue, initial }: { catalogue: MockArchetype[]; initial: string }) {
  const headingId = useId();
  // Product default: minimal (Q1). Stories that need the suggestions pass another choice.
  const [archetypeId, setArchetypeId] = useState(initial);
  const archetype = catalogue.find((item) => item.id === archetypeId)!;
  const optional = archetype.documents.filter((doc) => doc.include === 'optional');
  const always = archetype.documents.filter((doc) => doc.include === 'always');
  const [ticked, setTicked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      catalogue.flatMap((a) => a.documents.map((d) => [`${a.id}:${d.id}`, Boolean(d.preselected)])),
    ),
  );
  // Requirements an unticked suggestion would leave unmet (none for the built-ins).
  const required = (type: string) =>
    archetype.requirements.some((r) => r.documentType === type && r.minCount > 0) &&
    !always.some((doc) => doc.type === type);

  return (
    <section aria-labelledby={headingId} className="grid gap-4">
      <header className="grid gap-1">
        <Typography as="h2" id={headingId} variant="title-md">
          Archetype
        </Typography>
        <Typography as="p" variant="body-md" className="text-content-secondary">
          The shape of the work: which documents the specification starts with and which are
          expected. You can add, remove or classify documents later.
        </Typography>
      </header>
      <RadioGroup
        value={archetypeId}
        onValueChange={setArchetypeId}
        aria-labelledby={headingId}
        className="grid gap-3"
      >
        {catalogue.map((item) => (
          <RadioGroupOption
            key={item.id}
            value={item.id}
            label={item.title}
            description={item.useWhen}
          />
        ))}
      </RadioGroup>
      <div className="grid gap-3 border-l border-border-subtle pl-4">
        {archetype.instructions && (
          <Collapsible className="-ml-control-padding-compact">
            <Collapsible.Trigger className="px-0">
              How to work with a {archetype.title} specification
            </Collapsible.Trigger>
            <Collapsible.Content>
              <p className="text-body-sm text-content-secondary">{archetype.instructions}</p>
            </Collapsible.Content>
          </Collapsible>
        )}
        <fieldset className="grid gap-3">
          <legend className="mb-2 text-title-sm text-content-primary">Documents to create</legend>
          {always.map((doc) => (
            <InlineNote key={doc.id} icon="check">
              {typeTitle(doc.type)} ({doc.filename}) is always created.
            </InlineNote>
          ))}
          {optional.map((doc) => {
            const key = `${archetype.id}:${doc.id}`;
            const type = documentTypes.find((item) => item.id === doc.type)!;
            const unmet = required(doc.type) && !ticked[key];

            return (
              <CheckboxField
                key={key}
                checked={ticked[key]}
                onCheckedChange={(value) =>
                  setTicked((prev) => ({ ...prev, [key]: value === true }))
                }
                label={type.title}
                description={
                  <>
                    <span className="font-mono">{doc.filename}</span> · {type.useWhen}
                    {unmet && (
                      <span className="mt-1 block text-content-secondary">
                        {archetype.title} expects a {type.title} document. Without it the
                        specification lists it as missing until you add one.
                      </span>
                    )}
                  </>
                }
              />
            );
          })}
        </fieldset>
      </div>
    </section>
  );
}

function FormPage({ catalogue, initial }: { catalogue: MockArchetype[]; initial: string }) {
  return (
    <div className="grid gap-8">
      <div className="grid gap-6">
        <p className="text-body-sm text-content-muted">Specs · New specification</p>
        <header className="grid gap-2">
          <Typography as="h1" variant="title-lg">
            New specification
          </Typography>
          <Typography as="p" variant="body-md" className="text-content-secondary">
            Name the work, choose the archetype that matches it and where it lives.
          </Typography>
        </header>
      </div>
      <Separator />
      <div className="grid gap-4">
        <Field>
          <Field.Label>Specification name</Field.Label>
          <TextInput defaultValue="Single sign-on" />
        </Field>
        <Field>
          <Field.Label>Goal (optional)</Field.Label>
          <TextArea defaultValue="Employees sign in through the corporate identity provider." />
          <Field.Description>Written into the overview as the goal.</Field.Description>
        </Field>
      </div>
      <Separator />
      <ArchetypeSection catalogue={catalogue} initial={initial} />
      <Separator />
      <section className="grid gap-1">
        <Typography as="h2" variant="title-md">
          Where do you want to work?
        </Typography>
        <Typography as="p" variant="body-sm" className="text-content-muted">
          (Workspace place section: unchanged, not part of this mock.)
        </Typography>
      </section>
      <Separator />
      <footer className="flex flex-col gap-3 @lg:flex-row @lg:items-center @lg:justify-between">
        <InlineNote icon={null}>
          Create makes the folder, the documents and one commit on the branch.
        </InlineNote>
        <div className="w-full @lg:w-auto @lg:shrink-0">
          <Button width="full">Create specification</Button>
        </div>
      </footer>
    </div>
  );
}

function ProgressConfiguration() {
  return (
    <div className="grid gap-8">
      <p className="text-body-sm text-content-muted">Specs · Creating a specification</p>
      <Typography as="h1" variant="title-lg">
        Creating: Single sign-on
      </Typography>
      <Typography as="p" variant="body-sm" className="text-content-muted">
        (Status tile and steps: unchanged, not part of this mock.)
      </Typography>
      <section className="grid gap-4">
        <Separator />
        <Typography as="h2" variant="title-sm">
          Configuration
        </Typography>
        <DescriptionList aria-label="Configuration">
          <SummaryRow label="Specification name" override={false}>
            Single sign-on
          </SummaryRow>
          <SummaryRow label="Archetype" override>
            Feature
          </SummaryRow>
          <SummaryRow label="Documents" override={false}>
            <span className="wrap-anywhere">overview.md, behaviour.md, ux.md, backend.md</span>
          </SummaryRow>
          <SummaryRow label="Where" override>
            In a new workspace
          </SummaryRow>
          <SummaryRow label="Branch name" override={false}>
            <code>feature/single-sign-on</code>
          </SummaryRow>
        </DescriptionList>
      </section>
    </div>
  );
}

function Page({ scenario }: { scenario: CreateScenario }) {
  const catalogue = scenario === 'owner-requirement' ? [...archetypes, ownerFeature] : archetypes;
  const narrow = scenario === 'progress';
  const content: ReactNode =
    scenario === 'progress' ? (
      <ProgressConfiguration />
    ) : (
      <FormPage
        catalogue={catalogue}
        initial={
          scenario === 'owner-requirement'
            ? 'team-feature'
            : scenario === 'feature'
              ? 'feature'
              : 'minimal'
        }
      />
    );

  return (
    <AppWorkspace fit="bounded" scroll="content">
      <AppWorkspace.Primary
        header={
          <WorkspaceHeader title={narrow ? 'Creating a specification' : 'New specification'} />
        }
      >
        <AppContent
          className={
            narrow ? 'mx-auto w-content-narrow max-w-full' : 'w-content-standard max-w-full'
          }
        >
          <AppWorkspaceBody scroll="area" padding="none">
            <div className="p-4 sm:p-6">
              <AppContentContainer size={narrow ? 'narrow' : 'standard'}>
                {content}
              </AppContentContainer>
            </div>
          </AppWorkspaceBody>
        </AppContent>
      </AppWorkspace.Primary>
    </AppWorkspace>
  );
}

export function CreateMock({ width, height = 900, scenario }: CreateMockProps) {
  return (
    <StoryLocalization locale="en">
      <div style={{ width, height }} data-mock-frame={width}>
        <AppShell
          navigation={<div className="px-3 py-4 text-body-md text-content-primary">Project</div>}
          style={{ height: '100%' }}
          labels={{ navigationTitle: 'Navigation' }}
        >
          <Page scenario={scenario} />
        </AppShell>
      </div>
    </StoryLocalization>
  );
}
