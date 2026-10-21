// Local ESLint rule: user-facing copy in JSX must come from the i18n catalogue.
//
// Flags (a) JSX text and string-literal JSX children that contain a letter and (b) string-literal
// values of copy-bearing JSX attributes (aria-label, title, placeholder, label, ...). Everything
// else (className, data-*, role, type, ids, hrefs, variants, icon names, ...) is ignored because
// only the listed attributes carry reader-facing text. Pure punctuation, digits and symbols are
// allowed. A local rule is used instead of eslint-plugin-react / eslint-plugin-i18next to avoid a
// new dependency and lockfile churn for ~60 lines of AST matching.

const COPY_ATTRIBUTES = new Set([
  'aria-label',
  'aria-description',
  'aria-roledescription',
  'title',
  'placeholder',
  'label',
  'description',
  'alt',
  'heading',
  'tooltip',
  'subtitle',
  'emptyLabel',
  'helperText',
  'hint',
  'caption',
]);

const hasLetter = (text) => /\p{L}/u.test(text);

export const noHardcodedCopy = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      text: 'Hard-coded user-facing text. Use the i18n catalogue (t(...) / <Trans />): {{text}}',
      attribute:
        'Hard-coded user-facing "{{name}}" attribute. Use the i18n catalogue (t(...)): {{text}}',
    },
  },
  create(context) {
    const preview = (text) => JSON.stringify(text.trim().slice(0, 40));
    return {
      JSXText(node) {
        if (hasLetter(node.value))
          context.report({ node, messageId: 'text', data: { text: preview(node.value) } });
      },
      JSXExpressionContainer(node) {
        if (node.parent.type === 'JSXAttribute') return;
        const { expression } = node;
        const value =
          expression.type === 'Literal' && typeof expression.value === 'string'
            ? expression.value
            : expression.type === 'TemplateLiteral' && expression.expressions.length === 0
              ? expression.quasis[0].value.cooked
              : undefined;
        if (value !== undefined && hasLetter(value))
          context.report({ node, messageId: 'text', data: { text: preview(value) } });
      },
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier' || !COPY_ATTRIBUTES.has(node.name.name)) return;
        const { value } = node;
        const text =
          value?.type === 'Literal' && typeof value.value === 'string'
            ? value.value
            : value?.type === 'JSXExpressionContainer' &&
                value.expression.type === 'Literal' &&
                typeof value.expression.value === 'string'
              ? value.expression.value
              : undefined;
        if (text !== undefined && hasLetter(text))
          context.report({
            node,
            messageId: 'attribute',
            data: { name: node.name.name, text: preview(text) },
          });
      },
    };
  },
};

export default { rules: { 'no-hardcoded-copy': noHardcodedCopy } };
