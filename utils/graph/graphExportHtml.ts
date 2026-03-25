import type { GraphExportPayload } from './graphData';
import graphStandaloneInline from './graphStandalone.inline.js?raw';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 与 GraphView 中 lucide 图标一致的 inline SVG（stroke） */
const ICON = {
  download: `<svg class="w-[18px] h-[18px] sm:w-5 sm:h-5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
  fileJson: `<svg class="w-[18px] h-[18px] sm:w-5 sm:h-5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1"/><path d="M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1"/></svg>`,
  network: `<svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/></svg>`,
  circle: `<svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>`,
  clock: `<svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  tags: `<svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>`
};

/** 生成可离线打开的独立 HTML（数据以 Base64 内嵌；交互与 App 内图谱一致；不含应用内 NoteEditor / 右侧编辑面板） */
export function buildStandaloneGraphHtml(payload: GraphExportPayload): string {
  const json = JSON.stringify(payload);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  const title = escapeHtml(payload.projectName || 'graph');
  const safeName = (payload.projectName || 'graph').replace(/[/\\\\?%*:|"<>]/g, '_');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.26.0/cytoscape.min.js"></script>
  <script src="https://unpkg.com/layout-base/layout-base.js"></script>
  <script src="https://unpkg.com/cose-base/cose-base.js"></script>
  <script src="https://unpkg.com/cytoscape-cose-bilkent/cytoscape-cose-bilkent.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <style>
    :root { --theme-color: ${payload.themeColor}; }
    #cy { width: 100%; height: 100vh; background: #f9fafb;
      background-image: radial-gradient(#e5e7eb 1px, transparent 1px); background-size: 20px 20px; }
    .mapping-preview-markdown p { margin-bottom: 0.6rem; line-height: 1.4; }
    .mapping-preview-markdown p:last-child { margin-bottom: 0; }
    .mapping-preview-markdown h1 { font-size: 1.25rem; font-weight: 800; margin: 0.8rem 0 0.4rem; }
    .mapping-preview-markdown h2 { font-size: 1.1rem; font-weight: 700; margin: 0.7rem 0 0.3rem; }
    .mapping-preview-markdown h3 { font-size: 1rem; font-weight: 600; margin: 0.6rem 0 0.2rem; }
    .mapping-preview-markdown ul, .mapping-preview-markdown ol { margin-bottom: 0.5rem; padding-left: 1.2rem; }
    .mapping-preview-markdown li { margin-bottom: 0.2rem; }
    .mapping-preview-markdown code { background: #f3f4f6; padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.85em; font-family: monospace; }
    .mapping-preview-markdown pre { background: #f9fafb; padding: 0.5rem; border-radius: 6px; overflow-x: auto; margin: 0.5rem 0; border: 1px solid #f3f4f6; }
  </style>
</head>
<body class="bg-gray-50 text-gray-800 antialiased overflow-hidden m-0">
  <div id="cy"></div>
  <div id="graph-note-preview" class="hidden"></div>

  <div class="fixed top-2 sm:top-4 right-2 sm:right-4 z-[500] pointer-events-auto flex items-center gap-1.5 sm:gap-2" id="graph-export-actions">
    <button type="button" id="btnDlJson" title="下载 JSON 数据" class="bg-white p-2 sm:p-3 rounded-xl shadow-lg transition-colors w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-gray-700 hover:bg-gray-50">
      ${ICON.download}
    </button>
    <button type="button" id="btnCopyJson" title="复制 JSON 到剪贴板" class="bg-white p-2 sm:p-3 rounded-xl shadow-lg transition-colors w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-gray-700 hover:bg-gray-50">
      ${ICON.fileJson}
    </button>
  </div>

  <div class="fixed bottom-20 left-1/2 -translate-x-1/2 z-[45] max-w-[min(100vw-1rem,28rem)] p-1.5 rounded-2xl shadow-xl border border-gray-200/80 ring-1 ring-black/[0.04] flex flex-wrap justify-center gap-1 pointer-events-auto" id="graph-layout-bar" style="background-color: rgba(255,255,255,0.9); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);">
    <button type="button" id="btnTagGrid" title="按标签分组网格（组内按标题排序）" class="flex items-center justify-center px-3 py-2 rounded-xl transition-all font-bold text-sm text-gray-500 hover:bg-gray-100">${ICON.tags}</button>
    <button type="button" id="btnCircle" title="环形布局" class="flex items-center justify-center px-3 py-2 rounded-xl transition-all font-bold text-sm text-gray-500 hover:bg-gray-100">${ICON.circle}</button>
    <button type="button" id="btnTime" title="时间线（需便签有开始年份）" class="flex items-center justify-center px-3 py-2 rounded-xl transition-all font-bold text-sm text-gray-500 hover:bg-gray-100">${ICON.clock}</button>
    <button type="button" id="btnCose" title="力传导布局" class="flex items-center justify-center px-3 py-2 rounded-xl transition-all font-bold text-sm text-gray-500 hover:bg-gray-100">${ICON.network}</button>
  </div>

  <script>window.__KM_GRAPH__=${JSON.stringify({ b64, safeName })};</script>
  <script>${graphStandaloneInline}</script>
</body>
</html>`;
}

export function downloadTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
