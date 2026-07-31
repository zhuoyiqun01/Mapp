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
  fileJson: `<svg class="w-[18px] h-[18px] sm:w-5 sm:h-5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1"/><path d="M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1"/></svg>`
};

/** 生成可离线打开的独立 HTML（数据以 Base64 内嵌；交互与 App 内图谱浏览一致；不含编辑器 / 布局切换 / 设置滑块） */
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
  <script src="https://unpkg.com/cytoscape-fcose/cytoscape-fcose.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <style>
    :root { --theme-color: ${payload.themeColor}; }
    #cy { width: 100%; height: 100vh; background: #f9fafb;
      background-image: radial-gradient(#e5e7eb 1px, transparent 1px); background-size: 20px 20px; }
    #graph-stage { position: relative; width: 100%; height: 100vh; overflow: hidden; }
    #graph-chrome-labels { position: absolute; inset: 0; z-index: 15; overflow: hidden; pointer-events: none; }
    #graph-related-panel:empty { display: none; }
    .mapping-preview-markdown p { margin-bottom: 0.6rem; line-height: 1.4; }
    .mapping-preview-markdown p:last-child { margin-bottom: 0; }
    .mapping-preview-markdown h1 { font-size: 1.25rem; font-weight: 800; margin: 0.8rem 0 0.4rem; }
    .mapping-preview-markdown h2 { font-size: 1.1rem; font-weight: 700; margin: 0.7rem 0 0.3rem; }
    .mapping-preview-markdown h3 { font-size: 1rem; font-weight: 600; margin: 0.6rem 0 0.2rem; }
    .mapping-preview-markdown ul, .mapping-preview-markdown ol { margin-bottom: 0.5rem; padding-left: 1.2rem; }
    .mapping-preview-markdown li { margin-bottom: 0.2rem; }
    .mapping-preview-markdown code { background: #f3f4f6; padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.85em; font-family: monospace; }
    .mapping-preview-markdown pre { background: #f9fafb; padding: 0.5rem; border-radius: 6px; overflow-x: auto; margin: 0.5rem 0; border: 1px solid #f3f4f6; }
    .mapping-preview-markdown a { color: #2563eb; text-decoration: underline; text-underline-offset: 2px; word-break: break-all; }
    .mapping-preview-markdown a:hover { color: #1d4ed8; }
  </style>
</head>
<body class="bg-gray-50 text-gray-800 antialiased overflow-hidden m-0">
  <div id="graph-stage">
    <div id="cy"></div>
    <div id="graph-chrome-labels" aria-hidden="true"></div>
  </div>
  <div id="graph-side-stack" class="fixed top-4 left-4 z-[1000] flex flex-col gap-3 pointer-events-none max-h-[calc(100vh-2rem)] overflow-y-auto">
    <div id="graph-note-preview" class="hidden"></div>
    <div id="graph-related-panel"></div>
  </div>

  <div class="fixed top-2 sm:top-4 right-2 sm:right-4 z-[500] pointer-events-auto flex items-center gap-1.5 sm:gap-2" id="graph-export-actions">
    <button type="button" id="btnDlJson" title="下载 JSON 数据" class="bg-white p-2 sm:p-3 rounded-xl shadow-lg transition-colors w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-gray-700 hover:bg-gray-50">
      ${ICON.download}
    </button>
    <button type="button" id="btnCopyJson" title="复制 JSON 到剪贴板" class="bg-white p-2 sm:p-3 rounded-xl shadow-lg transition-colors w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-gray-700 hover:bg-gray-50">
      ${ICON.fileJson}
    </button>
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
