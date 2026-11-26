// Local ESLint rule: a product concept's icon comes from the product icon dictionary, never from
// its glyph.
//
// Flags (a) importing one of the dictionary's glyphs (or an alias of it) from `lucide-react`, and a
// namespace import of `lucide-react`, which would bypass the check, and (b) naming one of those
// glyphs through its `Icon` registry name in an icon position: an `icon`/`leadingIcon`/... JSX
// attribute or object property, a `name` attribute of an `*Icon` element, the `name` of an
// `icon: { name }` object, a value of an object held by an icon-named variable (`kindIcon`,
// `TONE_ICONS`) or a `glyph = '...'` default, through `?:`, `&&`/`||`/`??` and `as`.
// Other strings ("branch" as a form field, "file" as a content kind) are not icon positions. The
// dictionary module itself is exempt through the block's `ignores`.

const ICON_PROPS = new Set(['icon', 'leadingIcon', 'trailingIcon', 'reasonIcon', 'glyph']);

const keyName = (key) =>
  key?.type === 'Identifier' ? key.name : key?.type === 'Literal' ? String(key.value) : undefined;

const jsxName = (name) =>
  name?.type === 'JSXIdentifier'
    ? name.name
    : name?.type === 'JSXMemberExpression'
      ? name.property.name
      : undefined;

const TRANSPARENT = new Set([
  'ConditionalExpression',
  'LogicalExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'JSXExpressionContainer',
]);

const ICON_MAP_NAME = /icon|glyph/i;

/** An object literal held by a variable named for icons (`kindIcon`, `TONE_ICONS`, `toneGlyph`). */
function iconMap(object) {
  if (object?.type !== 'ObjectExpression') {
    return false;
  }

  let node = object;
  while (node.parent?.type === 'TSAsExpression' || node.parent?.type === 'TSSatisfiesExpression') {
    node = node.parent;
  }

  return (
    node.parent?.type === 'VariableDeclarator' && ICON_MAP_NAME.test(node.parent.id?.name ?? '')
  );
}

/** The icon position a string literal fills, if any. */
function iconPosition(literal) {
  let node = literal;
  while (TRANSPARENT.has(node.parent?.type)) {
    // A literal in a conditional's test chooses nothing.
    if (node.parent.type === 'ConditionalExpression' && node.parent.test === node) {
      return undefined;
    }

    node = node.parent;
  }

  const parent = node.parent;
  if (parent?.type === 'JSXAttribute') {
    const attribute = jsxName(parent.name);
    if (ICON_PROPS.has(attribute)) {
      return attribute;
    }

    const element = jsxName(parent.parent?.name);

    return attribute === 'name' && element?.endsWith('Icon') ? 'name' : undefined;
  }

  if (parent?.type === 'Property' && parent.value === node) {
    const key = keyName(parent.key);
    if (ICON_PROPS.has(key) || iconMap(parent.parent)) {
      return key;
    }

    // `icon: { name: 'archive', className }`, or `{ info: { name: 'chat' } }` in an icon map
    const owner = parent.parent?.parent;

    return key === 'name' &&
      owner?.type === 'Property' &&
      (ICON_PROPS.has(keyName(owner.key)) || iconMap(owner.parent))
      ? 'name'
      : undefined;
  }

  if (parent?.type === 'AssignmentPattern' && parent.right === node) {
    return ICON_PROPS.has(parent.left?.name) ? parent.left.name : undefined;
  }

  return undefined;
}

export const noDirectProductIcon = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
          glyphs: { type: 'array', items: { type: 'string' } },
          registryNames: { type: 'array', items: { type: 'string' } },
          module: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      glyph:
        '"{{name}}" is a product icon. Name the concept from {{module}} (productIcons.<concept>) instead of importing the glyph.',
      namespace:
        'Import lucide-react glyphs by name: a namespace import hides product icons from this check.',
      registry:
        '"{{name}}" names a product icon. Use the concept from {{module}} (productIcons.<concept>) instead of the Icon registry name.',
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const glyphs = new Set(options.glyphs ?? []);
    const registryNames = new Set(options.registryNames ?? []);
    const module = options.module ?? 'the product icon dictionary';

    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (source !== 'lucide-react' && !String(source).startsWith('lucide-react/')) {
          return;
        }

        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportNamespaceSpecifier') {
            context.report({ node: specifier, messageId: 'namespace' });
          } else if (
            specifier.type === 'ImportSpecifier' &&
            glyphs.has(keyName(specifier.imported))
          ) {
            context.report({
              node: specifier,
              messageId: 'glyph',
              data: { name: keyName(specifier.imported), module },
            });
          }
        }
      },
      Literal(node) {
        if (typeof node.value !== 'string' || !registryNames.has(node.value)) {
          return;
        }

        if (iconPosition(node)) {
          context.report({ node, messageId: 'registry', data: { name: node.value, module } });
        }
      },
    };
  },
};

export default { rules: { 'no-direct-product-icon': noDirectProductIcon } };
