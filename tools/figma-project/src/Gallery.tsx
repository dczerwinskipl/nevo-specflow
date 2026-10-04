import { DesignCaptureProvider } from '@nevo/figma-capture/metadata';
import { colorTokens } from '@nevo/ui/design-system/theme';
import { designSpecs, captureSections, exportProfiles } from './registry';
import { ProjectionFixtures, projectionFixtureSpecs } from './ProjectionFixtures';
import './gallery.css';

export function Gallery() {
  const definitions = [...designSpecs, ...projectionFixtureSpecs].map((spec) => ({
    ...spec,
    description: captureSections.find((section) => section.component === spec.component)
      ?.description,
  }));
  return (
    <DesignCaptureProvider>
      <main className="gallery-root">
        <script id="design-capture-registry" type="application/json">
          {JSON.stringify({ definitions, colorTokens, profiles: exportProfiles })}
        </script>
        <header className="hero">
          <p className="eyebrow">Nevo UI capture pipeline</p>
          <h1>Code → rendered DOM → IR → Figma</h1>
          <p>
            The sections below are extractor fixtures. Change the CSS or add a capture, run
            <code>pnpm figma:export</code>, then import the JSON with the development plugin.
          </p>
        </header>

        <ProjectionFixtures />

        {captureSections.map((section) => {
          return (
            <section className="panel" key={section.component}>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">{section.kind}</p>
                  <h2>{section.title}</h2>
                </div>
                <span>{section.description}</span>
              </div>
              {section.render()}
            </section>
          );
        })}
      </main>
    </DesignCaptureProvider>
  );
}
