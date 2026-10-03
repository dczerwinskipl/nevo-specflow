import type {
  FigmaComponentDefinition,
  ComponentCaptureIR,
  DesignSystemIR,
  DesignValue,
  FigmaGeometryOverride,
  FigmaExportProfileIR,
  NestedLayerIR,
  ScreensIR,
  SlotIR,
  FigmaSlotDefinition,
} from './ir';

type AnyIR = DesignSystemIR | ScreensIR;

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}

function record(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'must be an object');
}

function array(value: unknown, path: string): asserts value is unknown[] {
  if (!Array.isArray(value)) fail(path, 'must be an array');
}

function text(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || !value) fail(path, 'must be a non-empty string');
}

function unique(values: readonly string[], path: string) {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length)
    fail(path, `contains duplicate values: ${[...new Set(duplicates)].join(', ')}`);
}

function validateGeometry(value: unknown, path: string) {
  if (value === undefined) return;
  record(value, path);
  const geometry = value as FigmaGeometryOverride;
  for (const field of ['x', 'y', 'width', 'height', 'gap'] as const) {
    const candidate = geometry[field];
    if (
      candidate !== undefined &&
      (!Number.isFinite(candidate) ||
        ((field === 'width' || field === 'height') && candidate <= 0) ||
        (field === 'gap' && candidate < 0))
    ) {
      fail(`${path}.${field}`, 'must be a finite positive dimension');
    }
  }
  if (
    geometry.layoutMode !== undefined &&
    !['NONE', 'HORIZONTAL', 'VERTICAL'].includes(geometry.layoutMode)
  ) {
    fail(`${path}.layoutMode`, 'must be NONE, HORIZONTAL or VERTICAL');
  }
}

function validateDefinition(
  value: unknown,
  path: string,
): asserts value is FigmaComponentDefinition {
  record(value, path);
  text(value.component, `${path}.component`);
  if (value.displayName !== undefined) text(value.displayName, `${path}.displayName`);
  if (value.description !== undefined) text(value.description, `${path}.description`);
  if (typeof value.order !== 'number' || !Number.isFinite(value.order))
    fail(`${path}.order`, 'must be finite');
  array(value.variantProperties, `${path}.variantProperties`);
  value.variantProperties.forEach((item, index) =>
    text(item, `${path}.variantProperties[${index}]`),
  );
  unique(value.variantProperties as string[], `${path}.variantProperties`);
  record(value.propertyValues, `${path}.propertyValues`);
  record(value.slots, `${path}.slots`);
  for (const property of value.variantProperties as string[]) {
    const values = value.propertyValues[property];
    array(values, `${path}.propertyValues.${property}`);
    if (!values.length) fail(`${path}.propertyValues.${property}`, 'must not be empty');
    unique(values.map(String), `${path}.propertyValues.${property}`);
  }
  for (const defaults of [value.defaultProperties]) {
    if (defaults === undefined) continue;
    record(defaults, `${path}.defaults`);
    for (const [property, actual] of Object.entries(defaults)) {
      if (!value.variantProperties.includes(property))
        fail(`${path}.defaults.${property}`, 'is not a declared variant property');
      if (!(value.propertyValues[property] as unknown[]).some((candidate) => candidate === actual))
        fail(`${path}.defaults.${property}`, 'is outside the declared axis');
    }
  }
  for (const [name, slot] of Object.entries(value.slots)) {
    record(slot, `${path}.slots.${name}`);
    if (!['text', 'asset-swap', 'container', 'slot'].includes(String(slot.kind)))
      fail(`${path}.slots.${name}.kind`, 'is not supported');
    if (slot.kind === 'text' || slot.kind === 'asset-swap' || slot.kind === 'slot')
      text(slot.propertyName, `${path}.slots.${name}.propertyName`);
    if (slot.displayName !== undefined) text(slot.displayName, `${path}.slots.${name}.displayName`);
    if (slot.kind === 'text') text(slot.defaultText, `${path}.slots.${name}.defaultText`);
    if (slot.kind === 'asset-swap') {
      text(slot.variantProperty, `${path}.slots.${name}.variantProperty`);
      if ('allowAssetValueRemap' in slot)
        fail(`${path}.slots.${name}.allowAssetValueRemap`, 'is authoring-only metadata');
      record(slot.defaultAssetRefs, `${path}.slots.${name}.defaultAssetRefs`);
      if (!Object.keys(slot.defaultAssetRefs).length)
        fail(`${path}.slots.${name}.defaultAssetRefs`, 'must not be empty');
      for (const [variant, stableId] of Object.entries(slot.defaultAssetRefs)) {
        text(variant, `${path}.slots.${name}.defaultAssetRefs key`);
        text(stableId, `${path}.slots.${name}.defaultAssetRefs.${variant}`);
      }
    }
  }
  if (value.figma !== undefined) {
    record(value.figma, `${path}.figma`);
    validateGeometry(value.figma.root, `${path}.figma.root`);
    if (value.figma.slots !== undefined) {
      record(value.figma.slots, `${path}.figma.slots`);
      for (const [name, geometry] of Object.entries(value.figma.slots)) {
        if (!(name in value.slots))
          fail(`${path}.figma.slots.${name}`, 'references an unknown slot');
        validateGeometry(geometry, `${path}.figma.slots.${name}`);
      }
    }
    if (value.figma.variants !== undefined) {
      record(value.figma.variants, `${path}.figma.variants`);
      for (const [name, variant] of Object.entries(value.figma.variants)) {
        record(variant, `${path}.figma.variants.${name}`);
        validateGeometry(variant.root, `${path}.figma.variants.${name}.root`);
      }
    }
  }
}

interface PreflightContext {
  definitions: ReadonlyMap<string, FigmaComponentDefinition>;
  colors: ReadonlySet<string>;
  textStyles: ReadonlySet<string>;
  assets: ReadonlySet<string>;
  dependencies: Map<string, Set<string>>;
}

function validateResourceRef(
  value: unknown,
  path: string,
  resources: ReadonlySet<string>,
  kind: string,
) {
  if (value === undefined) return;
  text(value, path);
  if (!resources.has(value)) fail(path, `references missing ${kind} ${value}`);
}

function validateBindings(value: unknown, path: string, context: PreflightContext) {
  if (value === undefined) return;
  record(value, path);
  for (const [target, token] of Object.entries(value)) {
    if (token === undefined) continue;
    if (!['background', 'border', 'content'].includes(target))
      fail(`${path}.${target}`, 'is not a binding target');
    text(token, `${path}.${target}`);
    if (!context.colors.has(token)) fail(`${path}.${target}`, `references missing token ${token}`);
  }
}

function assertSlotKind(
  actual: unknown,
  expected: FigmaSlotDefinition,
  path: string,
  nested: boolean,
) {
  const actualKind =
    nested && typeof actual === 'string'
      ? 'text'
      : actual && typeof actual === 'object' && 'kind' in actual
        ? String((actual as { kind?: unknown }).kind)
        : 'unknown';
  if (actualKind !== expected.kind) {
    fail(path, `declared ${expected.kind} slot cannot receive ${actualKind}`);
  }
}

function validateLayer(
  value: unknown,
  path: string,
  owner: string,
  context: PreflightContext,
): asserts value is NestedLayerIR {
  record(value, path);
  if ('componentRef' in value) {
    text(value.componentRef, `${path}.componentRef`);
    record(value.properties, `${path}.properties`);
    record(value.slots, `${path}.slots`);
    const ref = value.componentRef;
    const referenced = context.definitions.get(ref);
    if (!referenced) fail(path, `references missing component ${ref}`);
    const properties = value.properties as Record<string, DesignValue>;
    for (const property of referenced.variantProperties) {
      if (
        !(referenced.propertyValues[property] ?? []).some(
          (candidate) => candidate === properties[property],
        )
      )
        fail(`${path}.properties.${property}`, 'is outside the referenced component axis');
    }
    for (const [slotName, slotSpec] of Object.entries(referenced.slots)) {
      if (slotSpec.required && value.slots[slotName] === undefined)
        fail(`${path}.slots.${slotName}`, 'is required by the referenced component');
    }
    for (const slotName of Object.keys(value.slots))
      if (!(slotName in referenced.slots))
        fail(`${path}.slots.${slotName}`, 'is not declared by the referenced component');
    for (const [slotName, slot] of Object.entries(value.slots)) {
      const slotSpec = referenced.slots[slotName];
      if (!slotSpec)
        fail(`${path}.slots.${slotName}`, 'is not declared by the referenced component');
      assertSlotKind(slot, slotSpec, `${path}.slots.${slotName}`, true);
    }
    context.dependencies.get(owner)?.add(ref);
    validateBindings(value.bindings, `${path}.bindings`, context);
    for (const [slotName, slot] of Object.entries(value.slots)) {
      if (typeof slot === 'string') continue;
      record(slot, `${path}.slots.${slotName}`);
      validateBindings(slot.bindings, `${path}.slots.${slotName}.bindings`, context);
      array(slot.children, `${path}.slots.${slotName}.children`);
      slot.children.forEach((child, index) =>
        validateLayer(child, `${path}.slots.${slotName}.children[${index}]`, owner, context),
      );
    }
    return;
  }
  text(value.kind, `${path}.kind`);
  if (value.kind === 'slot-ref') {
    text(value.name, `${path}.name`);
    if (value.displayName !== undefined) text(value.displayName, `${path}.displayName`);
    return;
  }
  if (value.kind === 'text') {
    if (typeof value.text !== 'string') fail(`${path}.text`, 'must be a string');
    record(value.style, `${path}.style`);
    validateBindings(value.bindings, `${path}.bindings`, context);
    validateResourceRef(
      value.textStyleRef,
      `${path}.textStyleRef`,
      context.textStyles,
      'text style',
    );
    validateResourceRef(value.colorRef, `${path}.colorRef`, context.colors, 'color');
    if (value.runs !== undefined) {
      array(value.runs, `${path}.runs`);
      let priorEnd = 0;
      for (const [index, run] of value.runs.entries()) {
        record(run, `${path}.runs[${index}]`);
        if (
          !Number.isInteger(run.start) ||
          !Number.isInteger(run.end) ||
          (run.start as number) < priorEnd ||
          (run.end as number) <= (run.start as number) ||
          (run.end as number) > value.text.length
        ) {
          fail(`${path}.runs[${index}]`, 'has invalid or overlapping range');
        }
        validateResourceRef(
          run.textStyleRef,
          `${path}.runs[${index}].textStyleRef`,
          context.textStyles,
          'text style',
        );
        validateResourceRef(
          run.colorRef,
          `${path}.runs[${index}].colorRef`,
          context.colors,
          'color',
        );
        if (run.textStyleRef === undefined && run.colorRef === undefined)
          fail(`${path}.runs[${index}]`, 'must reference a text style or color');
        priorEnd = run.end as number;
      }
    }
    return;
  }
  if (value.kind === 'asset') {
    validateResourceRef(value.assetRef, `${path}.assetRef`, context.assets, 'asset');
    validateResourceRef(value.colorRef, `${path}.colorRef`, context.colors, 'color');
    record(value.style, `${path}.style`);
    return;
  }
  if (value.kind === 'element') {
    text(value.name, `${path}.name`);
    record(value.style, `${path}.style`);
    validateBindings(value.bindings, `${path}.bindings`, context);
    array(value.children, `${path}.children`);
    value.children.forEach((child, index) =>
      validateLayer(child, `${path}.children[${index}]`, owner, context),
    );
    return;
  }
  fail(`${path}.kind`, `unsupported nested layer ${String(value.kind)}`);
}

function validateSlot(
  value: unknown,
  path: string,
  owner: string,
  context: PreflightContext,
  slotSpec: FigmaSlotDefinition,
): asserts value is SlotIR {
  record(value, path);
  text(value.kind, `${path}.kind`);
  if (!['text', 'asset-swap', 'container', 'slot'].includes(value.kind))
    fail(`${path}.kind`, 'is not supported');
  assertSlotKind(value, slotSpec, path, false);
  record(value.style, `${path}.style`);
  validateBindings(value.bindings, `${path}.bindings`, context);
  if (value.kind === 'text') {
    if (typeof value.text !== 'string') fail(`${path}.text`, 'must be a string');
    validateResourceRef(
      value.textStyleRef,
      `${path}.textStyleRef`,
      context.textStyles,
      'text style',
    );
    validateResourceRef(value.colorRef, `${path}.colorRef`, context.colors, 'color');
  } else if (value.kind === 'asset-swap') {
    record(value.asset, `${path}.asset`);
    validateLayer(value.asset, `${path}.asset`, owner, context);
  } else {
    array(value.children, `${path}.children`);
    value.children.forEach((child, index) =>
      validateLayer(child, `${path}.children[${index}]`, owner, context),
    );
  }
}

function validateCapture(
  value: unknown,
  path: string,
  spec: FigmaComponentDefinition,
  context: PreflightContext,
): asserts value is ComponentCaptureIR {
  record(value, path);
  text(value.stableId, `${path}.stableId`);
  if (typeof value.sourceId !== 'string') fail(`${path}.sourceId`, 'must be a string');
  if (value.component !== spec.component) fail(`${path}.component`, `must equal ${spec.component}`);
  record(value.properties, `${path}.properties`);
  for (const property of spec.variantProperties) {
    const actual = value.properties[property] as DesignValue;
    if (!(spec.propertyValues[property] ?? []).some((candidate) => candidate === actual))
      fail(
        `${path}.properties.${property}`,
        `value ${String(actual)} is outside the declared axis`,
      );
  }
  record(value.root, `${path}.root`);
  const captureProperties = value.properties as Record<string, DesignValue>;
  const expectedStableId = `${spec.component}/${spec.variantProperties.map((property) => String(captureProperties[property])).join('/')}`;
  if (value.stableId !== expectedStableId)
    fail(`${path}.stableId`, `must equal ${expectedStableId}`);
  validateBindings(value.bindings, `${path}.bindings`, context);
  record(value.slots, `${path}.slots`);
  for (const [name, slotSpec] of Object.entries(spec.slots)) {
    const slot = value.slots[name];
    if (slotSpec.required && slot === undefined) fail(`${path}.slots.${name}`, 'is required');
    if (slot !== undefined)
      validateSlot(slot, `${path}.slots.${name}`, spec.component, context, slotSpec);
  }
  if (value.structure !== undefined) {
    array(value.structure, `${path}.structure`);
    value.structure.forEach((layer, index) =>
      validateLayer(layer, `${path}.structure[${index}]`, spec.component, context),
    );
  }
}

function validateDependencyGraph(context: PreflightContext) {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (component: string) => {
    if (visited.has(component)) return;
    if (visiting.has(component)) fail('IR.dependencies', `contains a cycle at ${component}`);
    visiting.add(component);
    for (const dependency of context.dependencies.get(component) ?? []) visit(dependency);
    visiting.delete(component);
    visited.add(component);
  };
  for (const component of context.dependencies.keys()) visit(component);
}

/** Full structural and semantic preflight for the mutating Figma importer. */
export function validateIR(value: unknown): asserts value is AnyIR {
  record(value, 'IR');
  if (value.kind !== 'design-system' && value.kind !== 'screens')
    fail('IR.kind', 'must be design-system or screens');
  if (value.kind === 'design-system' && value.schemaVersion !== 4)
    fail('IR.schemaVersion', 'Unsupported design-system schemaVersion');
  if (value.kind === 'screens' && value.schemaVersion !== 3)
    fail('IR.schemaVersion', 'Unsupported screens schemaVersion');
  if (value.profile !== undefined) {
    record(value.profile, 'IR.profile');
    text(value.profile.id, 'IR.profile.id');
    text(value.profile.owner, 'IR.profile.owner');
    text(value.profile.displayName, 'IR.profile.displayName');
    array(value.profile.roots, 'IR.profile.roots');
    value.profile.roots.forEach((root, index) => text(root, `IR.profile.roots[${index}]`));
    unique(value.profile.roots as string[], 'IR.profile.roots');
    if (value.profile.resources !== 'owned' && value.profile.resources !== 'dependencies')
      fail('IR.profile.resources', 'must be owned or dependencies');
  }
  const profile = value.profile as unknown as FigmaExportProfileIR | undefined;
  if (value.diagnostics !== undefined) {
    array(value.diagnostics, 'IR.diagnostics');
    const supported = new Set([
      'unsupported-grid',
      'non-uniform-spacing',
      'unsupported-effect',
      'unsupported-transform',
      'unsupported-fixed-position',
      'unsupported-sticky-position',
      'unsupported-stacking-context',
      'unsupported-containing-block',
      'unsupported-background-image',
      'unsupported-border-style',
      'unsupported-outline',
    ]);
    for (const [index, diagnostic] of value.diagnostics.entries()) {
      record(diagnostic, `IR.diagnostics[${index}]`);
      if (!supported.has(String(diagnostic.code)))
        fail(`IR.diagnostics[${index}].code`, 'is not supported');
      if (diagnostic.severity !== 'warning')
        fail(`IR.diagnostics[${index}].severity`, 'must be warning');
      text(diagnostic.message, `IR.diagnostics[${index}].message`);
    }
  }
  array(value.definitions, 'IR.definitions');
  value.definitions.forEach((definition, index) =>
    validateDefinition(definition, `IR.definitions[${index}]`),
  );
  const definitions = new Map(
    (value.definitions as FigmaComponentDefinition[]).map((definition) => [
      definition.component,
      definition,
    ]),
  );
  if (definitions.size !== value.definitions.length)
    fail('IR.definitions', 'component names must be unique');
  for (const [index, root] of (profile?.roots ?? []).entries()) {
    if (!definitions.has(root)) fail(`IR.profile.roots[${index}]`, `references missing ${root}`);
  }
  record(value.resources, 'IR.resources');
  const resources = value.resources as unknown as DesignSystemIR['resources'];
  const identityKinds = new Map<string, string>();
  const registerIdentity = (stableId: string, kind: string, path: string) => {
    const previous = identityKinds.get(stableId);
    if (previous && previous !== kind)
      fail(path, `stableId ${stableId} is already used by ${previous}`);
    identityKinds.set(stableId, kind);
  };
  for (const resource of ['colors', 'textStyles', 'assets'] as const) {
    array(value.resources[resource], `IR.resources.${resource}`);
    for (const [index, item] of value.resources[resource].entries()) {
      record(item, `IR.resources.${resource}[${index}]`);
      text(item.stableId, `IR.resources.${resource}[${index}].stableId`);
      registerIdentity(item.stableId, resource, `IR.resources.${resource}[${index}].stableId`);
      if (resource === 'colors') {
        text(item.name, `IR.resources.${resource}[${index}].name`);
        text(item.value, `IR.resources.${resource}[${index}].value`);
      }
      if (resource === 'textStyles') {
        if (item.kind !== 'text-style')
          fail(`IR.resources.${resource}[${index}].kind`, 'must be text-style');
        for (const field of ['variant', 'role', 'size', 'sample']) {
          if (field in item)
            fail(
              `IR.resources.${resource}[${index}].${field}`,
              'is catalog metadata and is not canonical resource data',
            );
        }
        text(item.name, `IR.resources.${resource}[${index}].name`);
        record(item.style, `IR.resources.${resource}[${index}].style`);
        for (const property of [
          'fontFamily',
          'fontSize',
          'fontWeight',
          'lineHeight',
          'letterSpacing',
          'textTransform',
        ]) {
          text(item.style[property], `IR.resources.${resource}[${index}].style.${property}`);
        }
      }
      if (resource === 'assets') {
        if (item.kind !== 'asset') fail(`IR.resources.${resource}[${index}].kind`, 'must be asset');
        for (const field of ['name', 'size']) {
          if (field in item)
            fail(
              `IR.resources.${resource}[${index}].${field}`,
              'is catalog metadata and is not canonical resource data',
            );
        }
        text(item.svg, `IR.resources.${resource}[${index}].svg`);
        record(item.style, `IR.resources.${resource}[${index}].style`);
        for (const property of ['width', 'height', 'opacity', 'color']) {
          text(item.style[property], `IR.resources.${resource}[${index}].style.${property}`);
        }
        if (!['svg', 'svg-mask'].includes(String(item.representation)))
          fail(`IR.resources.${resource}[${index}].representation`, 'is not supported');
      }
    }
    unique(
      resources[resource].map((item) => item.stableId),
      `IR.resources.${resource}`,
    );
  }
  const context: PreflightContext = {
    definitions,
    colors: new Set(resources.colors.map((item) => item.stableId)),
    textStyles: new Set(resources.textStyles.map((item) => item.stableId)),
    assets: new Set(resources.assets.map((item) => item.stableId)),
    dependencies: new Map([...definitions.keys()].map((name) => [name, new Set()])),
  };
  for (const definition of definitions.values()) {
    for (const binding of Object.values(definition.bindings ?? {})) {
      if (!definition.variantProperties.includes(binding.property))
        fail(
          `IR.definitions.${definition.component}.bindings`,
          `unknown property ${binding.property}`,
        );
      for (const token of Object.values(binding.values))
        if (!context.colors.has(token))
          fail(
            `IR.definitions.${definition.component}.bindings`,
            `references missing token ${token}`,
          );
    }
    for (const [slotName, slot] of Object.entries(definition.slots)) {
      if (slot.kind !== 'asset-swap') continue;
      if (!definition.variantProperties.includes(slot.variantProperty)) {
        fail(
          `IR.definitions.${definition.component}.slots.${slotName}.variantProperty`,
          'must name a declared variant property',
        );
      }
      for (const variant of definition.propertyValues[slot.variantProperty] ?? []) {
        const assetRef = slot.defaultAssetRefs[String(variant)];
        if (!assetRef)
          fail(
            `IR.definitions.${definition.component}.slots.${slotName}.defaultAssetRefs`,
            `is missing variant ${String(variant)}`,
          );
        if (!context.assets.has(assetRef))
          fail(
            `IR.definitions.${definition.component}.slots.${slotName}.defaultAssetRefs`,
            `references missing asset ${assetRef}`,
          );
      }
    }
  }
  const collection = value.kind === 'design-system' ? value.components : value.screens;
  record(collection, value.kind === 'design-system' ? 'IR.components' : 'IR.screens');
  const requiredTargets =
    value.kind === 'design-system'
      ? new Set(['component', undefined])
      : new Set(['fragment', 'screen']);
  const requiredDefinitions = profile
    ? profile.roots.map((root) => definitions.get(root)!).filter(Boolean)
    : [...definitions.values()];
  for (const definition of requiredDefinitions) {
    if (
      requiredTargets.has(definition.target) &&
      !Object.prototype.hasOwnProperty.call(collection, definition.component)
    )
      fail('IR collection', `missing ${definition.component}`);
  }
  for (const [component, captures] of Object.entries(collection)) {
    const spec = definitions.get(component);
    if (!spec) fail(`IR collection ${component}`, 'has no definition');
    array(captures, `IR collection ${component}`);
    captures.forEach((capture, index) =>
      validateCapture(capture, `${component}[${index}]`, spec, context),
    );
    if (!captures.length) fail(`IR collection ${component}`, 'must contain at least one capture');
    const groups = new Map<string, ComponentCaptureIR[]>();
    for (const capture of captures as ComponentCaptureIR[])
      groups.set(capture.stableId, [...(groups.get(capture.stableId) ?? []), capture]);
    for (const [stableId, group] of groups) {
      registerIdentity(stableId, 'component', `IR collection ${component}`);
      if (
        spec.target !== 'fragment' &&
        spec.target !== 'screen' &&
        group.length > 1 &&
        group.filter((item) => item.canonical).length !== 1
      )
        fail(
          `IR collection ${component}`,
          `${stableId} duplicates require exactly one canonical capture`,
        );
    }
  }
  validateDependencyGraph(context);
}
