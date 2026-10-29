import {
  loadProjectCatalogue,
  openSpecFlowEngine,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';

/** The one line `start` prints when the project cannot create a Specification yet. */
export const DEFINITIONS_MISSING_HINT =
  'No archetype definitions found: creating Specifications is not possible yet. Run "nevo-specflow definitions install".';

/** The hint when the project has no usable archetype (no folder, an empty one, or every file invalid). */
export async function definitionsMissingHint(engine: SpecFlowEngine): Promise<string | undefined> {
  const { catalogue } = await loadProjectCatalogue(engine);

  return catalogue.archetypes.length === 0 ? DEFINITIONS_MISSING_HINT : undefined;
}

/** Print the hint for the project at `cwd`; a failure to find out is never a failure to start. */
export async function printDefinitionsMissingHint(
  cwd: string,
  stdout: (line: string) => void,
): Promise<void> {
  try {
    const hint = await definitionsMissingHint(await openSpecFlowEngine({ cwd }));
    if (hint !== undefined) {
      stdout(hint);
    }
  } catch {
    // The runtime reports its own startup problems.
  }
}
