import { validateIR } from '@nevo/figma-core/schema';
import {
  orderFigmaComponentDefinitionsByDependencies,
  resourceCatalogStableId,
  screenRequirements,
} from '../plan';
import { ensureSection, findStable, removeStaleManagedChildren } from './core/figmaNodes';
import {
  DATA_KEY,
  DESIGN_SECTION_ID,
  type DesignSystemIR,
  MANAGED_KEY,
  OVERVIEWS_SECTION_ID,
  RESOURCE_KIND_KEY,
  SCREENS_SECTION_ID,
  type ScreensIR,
} from './core/model';
import { canonicalCaptures } from './features/componentLayout';
import { reconcileComponentNestedSlots, upsertComponentSet } from './features/components';
import { readDesignResources, upsertDesignResources } from './features/documentResources';
import {
  componentOverviewModel,
  assetOverviewModel,
  reflowOverviewStack,
  textStyleOverviewModel,
  upsertOverview,
} from './features/overviews';
import { upsertAssetCatalog, upsertTextStyleCatalog } from './features/resourceComponents';
import { upsertScreens } from './features/screens';
import { adoptManagedPage, ensureManagedPage, locateManagedPage } from './core/managedPage';
import { figmaProjectConfig } from '../config';
import {
  resourceCatalogsOfKind,
  type ResourceCatalogDefinition,
} from '@nevo/figma-core/authoring';
import { existingAssetResources, upsertAssetResources } from './features/assetResources';
import type { IRInspection, IRInspectionItem, InspectionItemKind } from '../messages';
import { createImportProgress, type ImportProgress } from '../progress';
export function assertDesignSystemIR(value: unknown): asserts value is DesignSystemIR {
  validateIR(value);
  if (!value || typeof value !== 'object') throw new Error('IR must be a JSON object');
  const candidate = value as unknown as Partial<DesignSystemIR>;
  if (candidate.kind !== 'design-system')
    throw new Error(`Expected design-system IR, received ${candidate.kind ?? 'unknown'}`);
  if (candidate.schemaVersion !== 4)
    throw new Error(`Unsupported schemaVersion: ${candidate.schemaVersion}`);
  if (!Array.isArray(candidate.definitions) || !candidate.resources || !candidate.components) {
    throw new Error('Design System IR v4 must contain definitions[], resources and components');
  }
}

export function assertScreensIR(value: unknown): asserts value is ScreensIR {
  validateIR(value);
  if (!value || typeof value !== 'object') throw new Error('IR must be a JSON object');
  const candidate = value as unknown as Partial<ScreensIR>;
  if (candidate.kind !== 'screens')
    throw new Error(`Expected screens IR, received ${candidate.kind ?? 'unknown'}`);
  if (candidate.schemaVersion !== 3)
    throw new Error(`Unsupported screens schemaVersion: ${candidate.schemaVersion}`);
  if (!Array.isArray(candidate.definitions) || !candidate.resources || !candidate.screens) {
    throw new Error('Screens IR must contain definitions[], resources and screens');
  }
}

function isTransientFigmaNodeInvalidation(error: unknown) {
  return error instanceof Error && error.message.includes('Node not found');
}

export async function importStage<T>(label: string, action: () => Promise<T> | T) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (!isTransientFigmaNodeInvalidation(error) || attempt === 2) break;
      // Structural component/set mutations can invalidate Figma node proxies
      // until the next plugin turn. The import stages are reconciliation upserts,
      // so retrying the current stage is safe and avoids requiring a manual rerun.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${label}: ${detail}`);
}

function designMasterRequirements(
  ir: DesignSystemIR,
  resourceCatalogs: readonly ResourceCatalogDefinition[],
) {
  const componentIds = ir.definitions
    .filter((spec) => !spec.target || spec.target === 'component')
    .flatMap((spec) => [...canonicalCaptures(spec, ir.components[spec.component] ?? []).keys()]);
  return [
    ...new Set([
      ...componentIds,
      ...resourceCatalogsOfKind(resourceCatalogs, 'text-style')
        .flatMap((catalog) => catalog.items)
        .filter((item) =>
          ir.resources.textStyles.some((style) => style.stableId === item.resourceRef),
        )
        .map((item) => resourceCatalogStableId(item.resourceRef)),
    ]),
  ].sort();
}

/** Read-only document preflight used by the importer preview. */
export async function inspectIR(
  value: unknown,
  resourceCatalogs: readonly ResourceCatalogDefinition[],
): Promise<IRInspection> {
  validateIR(value);
  const ir = value as DesignSystemIR | ScreensIR;
  const requirements =
    ir.kind === 'design-system'
      ? designMasterRequirements(ir, resourceCatalogs).map((stableId) => ({
          stableId,
          kind: 'component' as const,
        }))
      : screenRequirements(ir).filter(
          (requirement) => requirement.kind === 'component' || requirement.kind === 'asset',
        );
  const page = await locateManagedPage();
  const [variables, textStyles] = await Promise.all([
    figma.variables.getLocalVariablesAsync('COLOR'),
    figma.getLocalTextStylesAsync(),
  ]);
  const managedComponents =
    page?.findAll(
      (node) => node.type === 'COMPONENT' && node.getPluginData(MANAGED_KEY) === 'true',
    ) ?? [];
  const assetSets = resourceCatalogsOfKind(resourceCatalogs, 'asset').flatMap((catalog) => {
    const set = page?.findOne(
      (node) =>
        node.type === 'COMPONENT_SET' && node.getPluginData(DATA_KEY) === catalog.setStableId,
    );
    return set?.type === 'COMPONENT_SET' ? [set] : [];
  });
  const existingAssetIds = new Set(
    [
      ...managedComponents
        .filter((node) => node.getPluginData(RESOURCE_KIND_KEY) === 'asset')
        .map((node) => node.getPluginData(DATA_KEY)),
      ...assetSets.flatMap((assetSet) =>
        assetSet.children
          .filter((node) => node.type === 'COMPONENT' && node.getPluginData(MANAGED_KEY) === 'true')
          .map((node) => node.getPluginData(DATA_KEY))
          .filter(Boolean),
      ),
    ].filter(Boolean),
  );
  const existingByKind = new Map<InspectionItemKind, Set<string>>([
    [
      'component',
      new Set(
        managedComponents
          .map((node) => node.getPluginData(DATA_KEY))
          .filter((stableId) => stableId && !existingAssetIds.has(stableId)),
      ),
    ],
    ['asset', existingAssetIds],
    [
      'color',
      new Set(
        variables
          .filter((item) => item.getPluginData(MANAGED_KEY) === 'true')
          .map((item) => item.getPluginData(DATA_KEY))
          .filter(Boolean),
      ),
    ],
    [
      'text-style',
      new Set(
        textStyles
          .filter((item) => item.getPluginData(MANAGED_KEY) === 'true')
          .map((item) => item.getPluginData(DATA_KEY))
          .filter(Boolean),
      ),
    ],
  ]);
  const expected: Array<Omit<IRInspectionItem, 'exists'>> = [
    ...requirements,
    ...ir.resources.colors.map((item) => ({ stableId: item.stableId, kind: 'color' as const })),
    ...ir.resources.textStyles.map((item) => ({
      stableId: item.stableId,
      kind: 'text-style' as const,
    })),
    ...(ir.kind === 'design-system'
      ? ir.resources.assets.map((item) => ({ stableId: item.stableId, kind: 'asset' as const }))
      : []),
  ];
  const items = expected.map((item) => ({
    ...item,
    exists: existingByKind.get(item.kind)?.has(item.stableId) ?? false,
  }));
  const deletions =
    ir.kind === 'design-system'
      ? [...existingByKind].flatMap(([kind, stableIds]) =>
          [...stableIds]
            .filter(
              (stableId) =>
                !expected.some((item) => item.kind === kind && item.stableId === stableId),
            )
            .map((stableId) => ({ stableId, kind })),
        )
      : [];
  return {
    kind: ir.kind,
    managedPageExists: Boolean(page),
    items,
    deletions,
  };
}

export async function importIR(
  value: unknown,
  resourceCatalogs: readonly ResourceCatalogDefinition[],
  report: ImportProgress = () => undefined,
) {
  if (!value || typeof value !== 'object') throw new Error('IR must be a JSON object');
  const kind = (value as { kind?: unknown }).kind;
  if (kind === 'design-system') return importDesignSystemIR(value, resourceCatalogs, report);
  if (kind === 'screens') return importScreensIR(value, report);
  throw new Error(`Unsupported IR kind: ${String(kind ?? 'unknown')}`);
}

function warningSuffix(ir: DesignSystemIR | ScreensIR) {
  const count = ir.diagnostics?.length ?? 0;
  return count ? ` ${count} CSS projection warning${count === 1 ? '' : 's'} recorded in IR.` : '';
}

export async function importDesignSystemIR(
  value: unknown,
  resourceCatalogs: readonly ResourceCatalogDefinition[],
  report: ImportProgress = () => undefined,
) {
  assertDesignSystemIR(value);
  const ir = value;
  const assetCatalogs = resourceCatalogsOfKind(resourceCatalogs, 'asset');
  const textStyleCatalogs = resourceCatalogsOfKind(resourceCatalogs, 'text-style');
  const componentSpecs = orderFigmaComponentDefinitionsByDependencies(
    ir.definitions.filter((spec) => !spec.target || spec.target === 'component'),
    ir.components,
  );
  const progress = createImportProgress(
    5 + assetCatalogs.length + textStyleCatalogs.length + componentSpecs.length * 2,
    report,
  );
  progress.complete('Validated Design System IR.');
  await progress.run('Preparing managed Figma page…', () => ensureManagedPage());
  const section = ensureSection(
    DESIGN_SECTION_ID,
    figmaProjectConfig.figma.sections.designSystem.name,
  );
  const overviewsSection = ensureSection(
    OVERVIEWS_SECTION_ID,
    figmaProjectConfig.figma.sections.overviews.name,
  );
  const definitions = new Map(
    ir.definitions.map((definition) => [definition.component, definition]),
  );
  let resources = await progress.run('Synchronizing variables and text styles…', () =>
    importStage('Design resources', () => upsertDesignResources(ir)),
  );
  const assets = await progress.run('Synchronizing asset main components…', () =>
    importStage('Asset main components', () => upsertAssetResources(ir, section, resources)),
  );
  resources = { ...resources, assets };
  const generated: Array<ComponentSetNode | ComponentNode> = [];
  const overviews: FrameNode[] = [];
  let y = 24;
  let overviewY = 24;
  let lastComponent: ComponentSetNode | ComponentNode | undefined;

  const presentedAssetRefs = new Set<string>();
  let lastAssetSet: ComponentSetNode | undefined;
  for (const assetCatalog of assetCatalogs) {
    const { assetSet, assetOverview } = await progress.run(
      `Synchronizing ${assetCatalog.name} asset catalogue…`,
      async () => {
        const assetSet = await importStage(`Asset catalogue ${assetCatalog.name}`, () =>
          upsertAssetCatalog(section, resources, assetCatalog, y),
        );
        // A corrupted ComponentSet repair can invalidate cached node proxies.
        // Refresh the asset map before overviews and component slots create instances.
        resources = { ...resources, assets: await existingAssetResources(ir.resources.assets) };
        const assetOverview = await upsertOverview(
          overviewsSection,
          assetOverviewModel(assetCatalog, resources),
          assetSet,
          overviewY,
        );
        return { assetSet, assetOverview };
      },
    );
    for (const item of assetCatalog.items) presentedAssetRefs.add(item.resourceRef);
    generated.push(assetSet);
    overviews.push(assetOverview);
    lastComponent = assetSet;
    lastAssetSet = assetSet;
    y = assetSet.y + assetSet.height + 48;
    overviewY = assetOverview.y + assetOverview.height + 48;
  }

  const unpresentedAssets = [...resources.assets]
    .filter(([stableId]) => !presentedAssetRefs.has(stableId))
    .map(([, master]) => master);
  if (assetCatalogs.length) {
    for (const [index, master] of unpresentedAssets.entries()) {
      if (master.parent !== section) section.appendChild(master);
      master.x = (lastAssetSet?.x ?? 24) + (lastAssetSet?.width ?? 0) + 24 + index * 40;
      master.y = lastAssetSet?.y ?? 24;
    }
    generated.push(...unpresentedAssets);
    y = Math.max(y, ...unpresentedAssets.map((asset) => asset.y + asset.height + 48));
  } else {
    const assetMasters = unpresentedAssets;
    for (const [index, master] of assetMasters.entries()) {
      if (master.parent !== section) section.appendChild(master);
      master.x = 24 + index * 40;
      master.y = 24;
    }
    generated.push(...assetMasters);
    lastComponent = assetMasters[assetMasters.length - 1];
    y = Math.max(...assetMasters.map((asset) => asset.y + asset.height), 24) + 48;
  }

  for (const textStyleCatalog of textStyleCatalogs) {
    const { textStyleSet, textStyleOverview } = await progress.run(
      `Synchronizing ${textStyleCatalog.name} text-style catalogue…`,
      async () => {
        const textStyleSet = await importStage(
          `Text-style catalogue ${textStyleCatalog.name}`,
          () => upsertTextStyleCatalog(ir, section, resources, y, textStyleCatalog),
        );
        const textStyleOverview = await upsertOverview(
          overviewsSection,
          textStyleOverviewModel(textStyleCatalog),
          textStyleSet,
          overviewY,
        );
        return { textStyleSet, textStyleOverview };
      },
    );
    generated.push(textStyleSet);
    overviews.push(textStyleOverview);
    lastComponent = textStyleSet;
    y = textStyleSet.y + textStyleSet.height + 48;
    overviewY = textStyleOverview.y + textStyleOverview.height + 48;
  }
  for (const spec of componentSpecs) {
    const { set, overview } = await progress.run(`Synchronizing ${spec.component}…`, async () => {
      const set = await importStage(`Component ${spec.component}`, () =>
        upsertComponentSet(ir, spec, section, resources, definitions, y),
      );
      const overview = await upsertOverview(
        overviewsSection,
        componentOverviewModel(spec, ir.components[spec.component] ?? []),
        set,
        overviewY,
      );
      return { set, overview };
    });
    generated.push(set);
    overviews.push(overview);
    lastComponent = set;
    y = set.y + set.height + 48;
    overviewY = overview.y + overview.height + 48;
  }
  for (const spec of componentSpecs) {
    await progress.run(`Finalizing ${spec.component} nested content…`, () =>
      importStage(`Component ${spec.component} nested slot reconciliation`, () =>
        reconcileComponentNestedSlots(ir, spec, resources, definitions),
      ),
    );
  }
  await progress.run('Finalizing sections and overview layout…', () => {
    removeStaleManagedChildren(
      section,
      new Set(generated.map((node) => node.getPluginData(DATA_KEY))),
      new Set(['COMPONENT', 'COMPONENT_SET']),
    );
    removeStaleManagedChildren(
      overviewsSection,
      new Set(overviews.map((node) => node.getPluginData(DATA_KEY))),
      new Set(['FRAME']),
    );
    // Upserts rebuild auto-layout children. Reflow once more from final heights so
    // newly inserted component families cannot leave older overview cards stacked
    // at positions calculated from an intermediate layout.
    reflowOverviewStack(overviews);
    section.resizeWithoutConstraints(
      Math.max(...generated.map((node) => node.x + node.width)) + 24,
      Math.max(...generated.map((node) => node.y + node.height)) + 24,
    );
    overviewsSection.resizeWithoutConstraints(
      Math.max(...overviews.map((node) => node.x + node.width)) + 24,
      Math.max(...overviews.map((node) => node.y + node.height)) + 24,
    );
    overviewsSection.x = section.x + section.width + 80;
    overviewsSection.y = section.y;
    if (lastComponent) figma.currentPage.selection = [lastComponent];
    figma.viewport.scrollAndZoomIntoView([section, overviewsSection]);
  });
  const componentSummary = ir.definitions
    .filter((spec) => !spec.target || spec.target === 'component')
    .map((spec) => {
      const count = canonicalCaptures(spec, ir.components[spec.component] ?? []).size;
      return spec.variantProperties.length
        ? `${count} ${spec.component} variants`
        : `${count} ${spec.component}`;
    })
    .join(', ');
  return `Updated ${ir.resources.colors.length} colors, ${ir.resources.textStyles.length} text styles, ${ir.resources.assets.length} assets and ${componentSummary}.${warningSuffix(ir)}`;
}

export async function importScreensIR(value: unknown, report: ImportProgress = () => undefined) {
  assertScreensIR(value);
  const screenSpecs = [...value.definitions]
    .filter((spec) => spec.target === 'screen')
    .sort((left, right) => left.order - right.order);
  const progress = createImportProgress(4 + screenSpecs.length, report);
  progress.complete('Validated Screens IR.');
  const { managedPage, resources } = await progress.run(
    'Locating Design System resources…',
    async () => {
      const managedPage = await locateManagedPage();
      if (!managedPage)
        throw new Error('Missing managed Design System page. Run Design System sync first.');
      await figma.setCurrentPageAsync(managedPage);
      return { managedPage, resources: await readDesignResources(value) };
    },
  );
  const renderIR: DesignSystemIR = {
    kind: 'design-system',
    schemaVersion: 4,
    generatedAt: value.generatedAt,
    source: value.source,
    semantics: value.semantics,
    definitions: value.definitions,
    resources: value.resources,
    diagnostics: value.diagnostics,
    components: value.screens,
  };
  const missingMasters = screenRequirements(value)
    .filter((requirement) => requirement.kind === 'component' || requirement.kind === 'asset')
    .filter((requirement) =>
      requirement.kind === 'asset'
        ? !resources.assets.has(requirement.stableId)
        : !findStable(requirement.stableId, ['COMPONENT']),
    )
    .map((requirement) => requirement.stableId);
  if (missingMasters.length) {
    throw new Error(
      `Missing Design System main components: ${missingMasters.join(', ')}. Run Design System sync first.`,
    );
  }
  const section = await progress.run('Preparing managed Screens section…', async () => {
    await adoptManagedPage(managedPage);
    const designSection = findStable<SectionNode>(DESIGN_SECTION_ID, ['SECTION']);
    return ensureSection(
      SCREENS_SECTION_ID,
      figmaProjectConfig.figma.sections.screens.name,
      designSection ? designSection.x + designSection.width + 80 : 1200,
    );
  });
  const definitions = new Map(
    value.definitions.map((definition) => [definition.component, definition]),
  );
  const frames: FrameNode[] = [];
  let y = 24;
  for (const spec of screenSpecs) {
    const result = await progress.run(`Synchronizing ${spec.component}…`, () =>
      importStage(`Screen ${spec.component}`, () =>
        upsertScreens(renderIR, spec, section, resources, definitions, y),
      ),
    );
    frames.push(...result.frames);
    y = result.nextY;
  }
  if (!frames.length) throw new Error('Screens IR contains no captured screens');
  await progress.run('Finalizing Screens layout…', () => {
    removeStaleManagedChildren(
      section,
      new Set(frames.map((frame) => frame.getPluginData(DATA_KEY))),
      new Set(['FRAME']),
    );
    section.resizeWithoutConstraints(Math.max(...frames.map((frame) => frame.width)) + 48, y - 24);
    figma.currentPage.selection = frames;
    figma.viewport.scrollAndZoomIntoView([section]);
  });
  return `Updated ${frames.length} screen${frames.length === 1 ? '' : 's'} without changing the Design System.${warningSuffix(value)}`;
}



