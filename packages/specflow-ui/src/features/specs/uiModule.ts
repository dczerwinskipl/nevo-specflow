import { contributeTo, type UiModule } from '../../app/ui-modules/contracts';
import { specificationAttentionItems } from './extensions/specificationAttentionItems';
import { productIcons } from '../../shared/product-icons';

/** Specification owns only specification-level Attention; domain features own theirs. */
export const specsUiModule: UiModule = {
  id: 'specflow.specifications',
  contributions: [
    contributeTo(specificationAttentionItems, {
      id: 'specflow.specifications.attention',
      getItems: ({ data }) =>
        data.attentionItems
          .filter((item) => item.kind === 'specification')
          .map((item) => ({ item, icon: productIcons.specification.item })),
    }),
  ],
};
