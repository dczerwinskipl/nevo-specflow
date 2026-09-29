import { figmaProjectConfig } from '../../config';
import { DATA_KEY, DESIGN_SECTION_ID, MANAGED_KEY } from './model';

/** Read-only lookup used by Screens preflight. */
export async function locateManagedPage() {
  await figma.loadAllPagesAsync();
  const config = figmaProjectConfig.figma.managedPage;
  let page = figma.root.children.find(
    (candidate) => candidate.getPluginData(DATA_KEY) === config.stableId,
  );
  if (!page) {
    page = figma.root.children.find((candidate) =>
      candidate.findOne((node) => node.getPluginData(DATA_KEY) === DESIGN_SECTION_ID),
    );
  }
  return page;
}

export async function adoptManagedPage(page: PageNode) {
  const config = figmaProjectConfig.figma.managedPage;
  page.name = config.name;
  page.setPluginData(DATA_KEY, config.stableId);
  page.setPluginData(MANAGED_KEY, 'true');
  await figma.setCurrentPageAsync(page);
  return page;
}

/** Selects one document-owned page before Design System reconciliation. */
export async function ensureManagedPage() {
  const page = (await locateManagedPage()) ?? figma.createPage();
  return await adoptManagedPage(page);
}



