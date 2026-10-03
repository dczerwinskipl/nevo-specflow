function byId<T extends HTMLElement>(id: string) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Importer UI is missing #${id}`);
  return node as T;
}

export const ui = {
  app: byId<HTMLElement>('app'),
  fileTab: byId<HTMLButtonElement>('tab-file'),
  jsonTab: byId<HTMLButtonElement>('tab-json'),
  filePanel: byId<HTMLElement>('panel-file'),
  jsonPanel: byId<HTMLElement>('panel-json'),
  json: byId<HTMLTextAreaElement>('json'),
  file: byId<HTMLInputElement>('file'),
  picker: byId<HTMLElement>('picker'),
  summary: byId<HTMLElement>('summary'),
  summaryName: byId<HTMLElement>('summary-name'),
  summaryMeta: byId<HTMLElement>('summary-meta'),
  summaryKind: byId<HTMLElement>('summary-kind'),
  summaryList: byId<HTMLElement>('summary-list'),
  fileError: byId<HTMLElement>('file-error'),
  jsonError: byId<HTMLElement>('json-error'),
  status: byId<HTMLElement>('status'),
  importButton: byId<HTMLButtonElement>('import'),
  progress: byId<HTMLElement>('progress'),
  progressFill: byId<HTMLElement>('progress-fill'),
  progressValue: byId<HTMLElement>('progress-value'),
  changeFile: byId<HTMLButtonElement>('change-file'),
};

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function detailsRow(name: string, count: string, description?: string) {
  const details = element('details');
  const heading = element('summary');
  heading.append(element('span', name, 'node-name'), element('span', count, 'count'));
  details.append(heading);
  if (description) details.append(element('div', description, 'description'));
  return details;
}
