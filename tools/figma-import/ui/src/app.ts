import type { DesignSystemIR, ScreensIR } from '@nevo/figma-core/ir';
import { validateIR } from '@nevo/figma-core/schema';
import type { ImporterRequest, ImporterResponse, IRInspection } from '../../messages';
import { renderDesignSystemPreview } from './designSystemPreview';
import { ui } from './dom';
import { renderScreensPreview } from './screensPreview';

type ImportIR = DesignSystemIR | ScreensIR;

interface ImporterState {
  tab: 'file' | 'json';
  raw: string;
  ir: ImportIR | null;
  error: string;
  fileName: string;
  importing: boolean;
  progressCompleted: number;
  progressTotal: number;
  outcome: '' | 'success' | 'error';
  message: string;
  inspection: IRInspection | null;
  inspectionError: string;
  requestId: number;
}

const state: ImporterState = {
  tab: 'file',
  raw: '',
  ir: null,
  error: '',
  fileName: '',
  importing: false,
  progressCompleted: 0,
  progressTotal: 0,
  outcome: '',
  message: '',
  inspection: null,
  inspectionError: '',
  requestId: 0,
};

function post(message: ImporterRequest) {
  parent.postMessage({ pluginMessage: message }, '*');
}

function resizeToContent() {
  const summaryHeight = state.ir ? Math.min(ui.summaryList.scrollHeight, 440) : 0;
  const desiredHeight = state.ir ? Math.max(620, 280 + summaryHeight) : 360;
  requestAnimationFrame(() =>
    post({
      type: 'RESIZE_UI',
      height: Math.min(720, Math.max(340, desiredHeight)),
    }),
  );
}

function requestInspection() {
  if (!state.ir) return;
  post({ type: 'INSPECT_IR', requestId: ++state.requestId, ir: state.ir });
}

function parseRaw(raw: string, fileName = state.fileName) {
  state.raw = raw;
  state.fileName = fileName;
  state.ir = null;
  state.error = '';
  state.outcome = '';
  state.message = '';
  state.inspection = null;
  state.inspectionError = '';
  if (raw.trim()) {
    try {
      const candidate: unknown = JSON.parse(raw);
      validateIR(candidate);
      state.ir = candidate;
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
    }
  }
  render();
  requestInspection();
}

function renderSummary() {
  ui.summaryList.replaceChildren();
  if (!state.ir) return;
  const groups =
    state.ir.kind === 'design-system'
      ? Object.keys(state.ir.components).length + 3
      : Object.values(state.ir.screens).reduce((sum, items) => sum + items.length, 0);
  ui.summaryName.textContent =
    [state.fileName, state.ir.source.name].find((value) => value !== '') ?? 'Pasted IR';
  const itemCount = state.inspection?.items.length ?? 0;
  const existingCount = state.inspection?.items.filter((item) => item.exists).length ?? 0;
  const newCount = itemCount - existingCount;
  const deletionCount = state.inspection?.deletions.length ?? 0;
  const inspectionMeta = state.inspection
    ? state.ir.kind === 'design-system'
      ? ` · ${newCount} new · ${existingCount} update · ${deletionCount} delete`
      : ` · ${existingCount}/${itemCount} dependencies available`
    : state.inspectionError
      ? ' · preflight unavailable'
      : ' · checking Figma file…';
  ui.summaryMeta.textContent = `${groups} groups · schema v${state.ir.schemaVersion}${inspectionMeta}`;
  ui.summaryKind.textContent = state.ir.kind === 'design-system' ? 'Design System' : 'Screens';
  if (state.ir.kind === 'design-system') {
    renderDesignSystemPreview(ui.summaryList, state.ir, state.inspection);
  } else {
    renderScreensPreview(ui.summaryList, state.ir, state.inspection);
  }
}

function renderStatus(
  missingDependencies: number,
  waitingForPreflight: boolean,
  preflightFailed: boolean,
) {
  ui.status.className = state.outcome || (state.error ? 'error' : '');
  if (state.message) ui.status.textContent = state.message;
  else if (state.error) ui.status.textContent = 'Fix the JSON before importing.';
  else if (!state.ir) ui.status.textContent = 'Choose a file or paste JSON to continue.';
  else if (waitingForPreflight) ui.status.textContent = 'Checking Design System dependencies…';
  else if (preflightFailed) ui.status.textContent = 'Could not verify Design System dependencies.';
  else if (missingDependencies > 0) {
    ui.status.textContent = `${missingDependencies} required Design System ${missingDependencies === 1 ? 'dependency is' : 'dependencies are'} missing.`;
  } else {
    ui.status.textContent = `${state.ir.kind === 'design-system' ? 'Design System' : 'Screens'} ready to import.`;
  }
}

function render() {
  const fileTab = state.tab === 'file';
  ui.fileTab.setAttribute('aria-selected', String(fileTab));
  ui.jsonTab.setAttribute('aria-selected', String(!fileTab));
  ui.filePanel.hidden = !fileTab;
  ui.jsonPanel.hidden = fileTab;
  ui.picker.hidden = Boolean(state.ir);
  ui.summary.hidden = !state.ir;
  ui.fileError.hidden = !state.error;
  ui.jsonError.hidden = !state.error;
  ui.fileError.textContent = state.error;
  ui.jsonError.textContent = state.error;
  if (ui.json.value !== state.raw) ui.json.value = state.raw;
  renderSummary();
  ui.progress.hidden = !state.importing;
  const progressTotal = Math.max(state.progressTotal, 1);
  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round((state.progressCompleted / progressTotal) * 100)),
  );
  ui.progress.setAttribute('aria-valuenow', String(progressPercent));
  ui.progress.setAttribute(
    'aria-valuetext',
    `${progressPercent}% (${state.progressCompleted} of ${state.progressTotal} steps)`,
  );
  ui.progressFill.style.width = `${progressPercent}%`;
  ui.progressValue.textContent = `${progressPercent}% · ${state.progressCompleted}/${state.progressTotal}`;

  const screens = state.ir?.kind === 'screens';
  const missingDependencies =
    screens && state.inspection ? state.inspection.items.filter((item) => !item.exists).length : 0;
  const waitingForPreflight = Boolean(screens && !state.inspection && !state.inspectionError);
  const preflightFailed = Boolean(screens && state.inspectionError);
  ui.importButton.hidden = !state.ir;
  ui.importButton.disabled =
    state.importing || waitingForPreflight || preflightFailed || missingDependencies > 0;
  ui.importButton.textContent = state.importing ? 'Importing…' : 'Import';
  if (!state.importing) renderStatus(missingDependencies, waitingForPreflight, preflightFailed);
  resizeToContent();
}

function selectTab(tab: ImporterState['tab']) {
  state.tab = tab;
  render();
}

ui.fileTab.addEventListener('click', () => selectTab('file'));
ui.jsonTab.addEventListener('click', () => selectTab('json'));
ui.file.addEventListener('change', () => {
  const selected = ui.file.files?.[0];
  if (selected) {
    void selected.text().then((contents) => parseRaw(contents, selected.name));
  }
});
ui.changeFile.addEventListener('click', () => {
  ui.file.value = '';
  ui.file.click();
});
ui.json.addEventListener('input', () => parseRaw(ui.json.value, ''));
ui.importButton.addEventListener('click', () => {
  if (!state.ir || state.importing || ui.importButton.disabled) return;
  state.importing = true;
  state.progressCompleted = 0;
  state.progressTotal = 0;
  state.outcome = '';
  state.message = 'Validating IR…';
  render();
  post({ type: 'IMPORT_IR', ir: state.ir });
});

window.onmessage = (event: MessageEvent<{ pluginMessage?: ImporterResponse }>) => {
  const message = event.data.pluginMessage;
  if (!message) return;
  if (message.type === 'INSPECTION' || message.type === 'INSPECTION_ERROR') {
    if (message.requestId !== state.requestId) return;
    state.inspection = message.type === 'INSPECTION' ? message.inspection : null;
    state.inspectionError = message.type === 'INSPECTION_ERROR' ? message.message : '';
    render();
    return;
  }
  if (!['PROGRESS', 'DONE', 'ERROR'].includes(message.type)) return;
  if (message.type === 'PROGRESS') {
    state.importing = true;
    state.message = message.message;
    state.progressCompleted = message.completed;
    state.progressTotal = message.total;
  } else {
    state.importing = false;
    state.outcome = message.type === 'DONE' ? 'success' : 'error';
    state.message = message.message;
    if (message.type === 'DONE') requestInspection();
  }
  render();
};

render();
