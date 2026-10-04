import type { FigmaComponentDefinition } from '@nevo/figma-core/ir';
import { Typography } from '@nevo/ui';

export const projectionFixtureSpec = {
  component: 'ProjectionFixture',
  target: 'fragment',
  order: 95,
  variantProperties: [],
  propertyValues: {},
  slots: {
    nativeInline: { kind: 'container', required: true },
    semanticInline: { kind: 'container', required: true },
    breadcrumb: { kind: 'container', required: true },
    translucent: { kind: 'container', required: true },
    elementOpacity: { kind: 'container', required: true },
    radialGradient: { kind: 'container', required: true },
    textSizing: { kind: 'container', required: true },
  },
} as const satisfies FigmaComponentDefinition;

const hostedControlFixtureSpec = {
  component: 'HostedControlFixture',
  target: 'fragment',
  order: 96,
  variantProperties: [],
  propertyValues: {},
  slots: {},
} as const satisfies FigmaComponentDefinition;

const hostedSlotFixtureSpec = {
  component: 'HostedSlotFixture',
  target: 'fragment',
  order: 97,
  variantProperties: [],
  propertyValues: {},
  slots: {
    control: { kind: 'slot', propertyName: 'Control', required: true },
    contextualControl: { kind: 'slot', propertyName: 'Contextual control', required: true },
  },
} as const satisfies FigmaComponentDefinition;

export const projectionFixtureSpecs = [
  projectionFixtureSpec,
  hostedControlFixtureSpec,
  hostedSlotFixtureSpec,
] as const;

/** Export-only probes for generic CSS projection; never rendered by the product. */
export function ProjectionFixtures() {
  return (
    <div className="projection-fixture">
      <div
        className="flex w-[400px] flex-col gap-4"
        data-design-capture="true"
        data-design-component="ProjectionFixture"
      >
        <div data-design-slot="nativeInline">
          <span>Repo</span> / <strong>Branch</strong>
        </div>
        <div
          className="flex flex-wrap"
          data-design-slot="semanticInline"
          data-design-text-flow="true"
          data-design-text-separator=" "
        >
          <Typography variant="body-sm">Repo</Typography>
          <Typography variant="body-sm">/</Typography>
          <Typography variant="label-md">Branch</Typography>
        </div>
        <div className="flex items-center gap-2" data-design-slot="breadcrumb">
          <Typography variant="body-sm">Repo</Typography>
          <Typography variant="body-sm">/</Typography>
          <Typography variant="label-md">Branch</Typography>
        </div>
        <div
          className="h-8 rounded border border-action-primary/20 bg-action-primary/10"
          data-design-slot="translucent"
        />
        <div className="h-8 opacity-50" data-design-slot="elementOpacity" />
        <div
          className="h-16"
          data-design-slot="radialGradient"
          style={{
            backgroundImage:
              'radial-gradient(75% 55% at 12% -12%, rgba(255, 255, 255, 0.1) 0%, transparent 68%)',
          }}
        />
        <div className="flex w-full items-center" data-design-slot="textSizing">
          <Typography className="w-20" variant="body-sm">
            Fixed
          </Typography>
          <Typography className="min-w-0 flex-1" variant="body-sm">
            Fill
          </Typography>
          <Typography variant="body-sm">Hug</Typography>
        </div>
      </div>
      <div
        className="flex w-72 flex-col gap-3"
        data-design-capture="true"
        data-design-component="HostedSlotFixture"
      >
        <div
          className="flex h-9 w-64 items-center rounded-lg border border-border-default bg-surface-control px-3 text-content-muted"
          data-design-capture="true"
          data-design-component="HostedControlFixture"
          data-design-source-id="hosted-control"
          data-design-slot="control"
        >
          <span data-design-layer="content">Projection probe</span>
        </div>
        <div
          className="flex h-9 w-64 items-center rounded-lg border border-border-default bg-surface-control px-3 text-content-muted"
          data-design-component="HostedControlFixture"
          data-design-slot="contextualControl"
          style={{ backgroundColor: 'transparent', borderWidth: 0 }}
        >
          <span data-design-layer="content">Contextual probe</span>
        </div>
      </div>
    </div>
  );
}
