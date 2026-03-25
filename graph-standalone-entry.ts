import {
  attachBoardlikeWheelZoom,
  attachGraphResizeObserver,
  decodeGraphPayloadFromBase64,
  runGraphCoseLayout,
  scheduleGraphResizeAndFit,
  wireStandaloneGraphControls,
  wireStandaloneGraphInteractions
} from './utils/graph/graphRuntimeCore';

declare global {
  interface Window {
    __KM_GRAPH__?: { b64: string; safeName: string };
    cytoscape?: (opts: Record<string, unknown>) => import('cytoscape').Core;
    cytoscapeCoseBilkent?: unknown;
    marked?: { parse: (md: string) => string };
  }
}

function main(): void {
  const boot = window.__KM_GRAPH__;
  const Cy = window.cytoscape;
  if (!boot || !Cy) return;

  try {
    (Cy as { use: (ext: unknown) => void }).use(window.cytoscapeCoseBilkent);
  } catch (e) {
    console.warn(e);
  }

  const payload = decodeGraphPayloadFromBase64(boot.b64);
  const container = document.getElementById('cy');
  if (!container) return;

  const cy = Cy({
    container,
    elements: payload.elements,
    style: payload.stylesheet,
    minZoom: 0.15,
    maxZoom: 4,
    wheelSensitivity: 0
  });
  attachBoardlikeWheelZoom(cy);
  runGraphCoseLayout(cy);
  attachGraphResizeObserver(cy, container);
  scheduleGraphResizeAndFit(cy);
  wireStandaloneGraphControls(cy, payload, boot.safeName);
  wireStandaloneGraphInteractions(cy, payload, payload.themeColor, window.marked ?? null);
}

main();
