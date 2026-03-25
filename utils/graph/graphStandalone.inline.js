(() => {
  // utils/graph/graphRuntimeCore.ts
  var GRAPH_SORT_LOCALE = "zh-Hans-CN";
  function orderedTagGroupKeysFromState(allKeys, layers) {
    const ordered = [];
    const seen = /* @__PURE__ */ new Set();
    for (const k of layers.order) {
      const key = String(k).trim();
      if (allKeys.has(key) && !seen.has(key)) {
        ordered.push(key);
        seen.add(key);
      }
    }
    const rest = [...allKeys].filter((k) => !seen.has(k)).sort((a, b) => {
      if (a === "" && b !== "") return 1;
      if (b === "" && a !== "") return -1;
      return a.localeCompare(b, GRAPH_SORT_LOCALE);
    });
    return [...ordered, ...rest];
  }
  var GRAPH_LAYER_WEIGHT_MIN = 0.1;
  var GRAPH_LAYER_WEIGHT_MAX = 1;
  var GRAPH_LAYER_WEIGHT_SPAN = GRAPH_LAYER_WEIGHT_MAX - GRAPH_LAYER_WEIGHT_MIN;
  function clampGraphLayerWeight(w) {
    return Math.min(GRAPH_LAYER_WEIGHT_MAX, Math.max(GRAPH_LAYER_WEIGHT_MIN, Number.isFinite(w) ? w : 0.5));
  }
  function graphLayerWeightNorm(wgt) {
    return (clampGraphLayerWeight(wgt) - GRAPH_LAYER_WEIGHT_MIN) / GRAPH_LAYER_WEIGHT_SPAN;
  }
  function stableAngleSeed(input) {
    let h = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967296;
  }
  function applyGraphWeightedCircleLayout(cy, layers) {
    const nodes = cy.nodes();
    if (nodes.length === 0) return;
    const byGroup = /* @__PURE__ */ new Map();
    nodes.forEach((n) => {
      const key = String(n.data("tagGroup") ?? "").trim();
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key).push(n);
    });
    const allKeys = new Set(byGroup.keys());
    const keysOrdered = orderedTagGroupKeysFromState(allKeys, layers);
    const hiddenSet = new Set((layers.hidden ?? []).map((h2) => String(h2).trim()));
    const visibleGroups = /* @__PURE__ */ new Map();
    const hiddenNodes = [];
    for (const key of keysOrdered) {
      const groupNodes = [...byGroup.get(key) ?? []].sort(
        (a, b) => String(a.data("fullTitle") || "").localeCompare(String(b.data("fullTitle") || ""), GRAPH_SORT_LOCALE)
      );
      if (hiddenSet.has(key)) {
        hiddenNodes.push(...groupNodes);
      } else if (groupNodes.length > 0) {
        visibleGroups.set(key, groupNodes);
      }
    }
    const w = cy.width();
    const h = cy.height();
    const cx = w / 2;
    const cyy = h / 2;
    const baseR = Math.min(w, h) * 0.36;
    const rInner = baseR * 0.22;
    const rOuter = baseR;
    const pos = /* @__PURE__ */ new Map();
    visibleGroups.forEach((groupNodes, tagKey) => {
      const wgt = layers.weights?.[tagKey] ?? 0.5;
      const norm = graphLayerWeightNorm(wgt);
      const r = rInner + norm * (rOuter - rInner);
      const n = groupNodes.length;
      const phase = stableAngleSeed(tagKey || "__untagged__") * 2 * Math.PI - Math.PI / 2;
      for (let i = 0; i < n; i += 1) {
        const angle = phase + 2 * Math.PI * i / Math.max(1, n);
        const node = groupNodes[i];
        pos.set(node.id(), { x: cx + r * Math.cos(angle), y: cyy + r * Math.sin(angle) });
      }
    });
    hiddenNodes.forEach((node, i) => {
      pos.set(node.id(), { x: cx + (i - hiddenNodes.length / 2) * 10, y: cyy });
    });
    cy.nodes().layout({
      name: "preset",
      animate: true,
      transform: (node) => pos.get(node.id()) ?? { x: cx, y: cyy }
    }).run();
    requestAnimationFrame(() => {
      cy.resize();
      cy.fit(void 0, 48);
    });
  }
  var GRAPH_WHEEL_ZOOM_SENSITIVITY = 1e-3;
  function getCyRenderer(cy) {
    const r = cy.renderer?.();
    return r && typeof r.projectIntoViewport === "function" ? r : null;
  }
  function attachBoardlikeWheelZoom(cy) {
    const container = cy.container();
    if (!container) return () => {
    };
    const handler = (e) => {
      if (!container.contains(e.target)) return;
      e.preventDefault();
      const scrollDelta = e.shiftKey ? Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY : e.deltaY;
      if (scrollDelta === 0) return;
      const delta = -scrollDelta * GRAPH_WHEEL_ZOOM_SENSITIVITY;
      const z = cy.zoom();
      const minZ = cy.minZoom();
      const maxZ = cy.maxZoom();
      const newZoom = Math.min(Math.max(minZ, z + delta), maxZ);
      if (Math.abs(newZoom - z) < 1e-9) return;
      const r = getCyRenderer(cy);
      if (!r) return;
      const pos = r.projectIntoViewport(e.clientX, e.clientY);
      const pan = cy.pan();
      const rz = cy.zoom();
      const rx = pos[0] * rz + pan.x;
      const ry = pos[1] * rz + pan.y;
      cy.zoom({ level: newZoom, renderedPosition: { x: rx, y: ry } });
    };
    let attached = false;
    const attach = () => {
      if (attached) return;
      attached = true;
      container.addEventListener("wheel", handler, { passive: false });
    };
    cy.ready(attach);
    return () => {
      if (attached) {
        container.removeEventListener("wheel", handler);
        attached = false;
      }
    };
  }
  function decodeGraphPayloadFromBase64(b64) {
    const json = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json);
  }
  function attachGraphResizeObserver(cy, el) {
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => cy.resize());
    });
    ro.observe(el);
    return () => ro.disconnect();
  }
  function scheduleGraphResizeAndFit(cy) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        cy.resize();
        cy.fit(void 0, 40);
      });
    });
  }
  function runGraphCoseLayout(cy) {
    cy.layout({ name: "cose-bilkent", animate: true, padding: 40 }).run();
  }
  function applyGraphCircleLayout(cy, refineWithForce = true, layers = null) {
    if (layers != null) {
      applyGraphWeightedCircleLayout(cy, layers);
      return;
    }
    const circleLayout = cy.layout({ name: "circle", animate: true, padding: 40 });
    if (!refineWithForce) {
      circleLayout.run();
      return;
    }
    circleLayout.one("layoutstop", () => {
      cy.layout({
        name: "cose-bilkent",
        randomize: false,
        animate: true,
        padding: 40,
        fit: true,
        quality: "draft",
        numIter: 600,
        nodeDimensionsIncludeLabels: true
      }).run();
    });
    circleLayout.run();
  }
  function applyGraphLayout(cy, name, circleRefineWithForce = true, graphLayers = null) {
    if (name === "circle") {
      applyGraphCircleLayout(cy, circleRefineWithForce, graphLayers);
      return;
    }
    cy.layout({
      name,
      animate: true,
      padding: 40
    }).run();
  }
  function applyGraphTagGridLayout(cy, layers = null) {
    const nodes = cy.nodes();
    if (nodes.length === 0) return;
    const w = cy.width();
    const margin = 56;
    const gapX = 20;
    const gapY = 26;
    const cellW = 128;
    const cellH = 70;
    const groupGapY = 40;
    const byGroup = /* @__PURE__ */ new Map();
    nodes.forEach((n) => {
      const key = String(n.data("tagGroup") ?? "").trim();
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key).push(n);
    });
    const allKeys = new Set(byGroup.keys());
    const hiddenSet = new Set((layers?.hidden ?? []).map((h) => String(h).trim()));
    const keys = layers ? orderedTagGroupKeysFromState(allKeys, layers) : [...allKeys].sort((a, b) => {
      if (a === "" && b !== "") return 1;
      if (b === "" && a !== "") return -1;
      return a.localeCompare(b, GRAPH_SORT_LOCALE);
    });
    const usableW = Math.max(80, w - 2 * margin);
    const cols = Math.max(1, Math.floor(usableW / (cellW + gapX)));
    let yTop = margin;
    const pos = /* @__PURE__ */ new Map();
    for (const key of keys) {
      const groupNodes = byGroup.get(key);
      groupNodes.sort(
        (a, b) => String(a.data("fullTitle") || "").localeCompare(String(b.data("fullTitle") || ""), GRAPH_SORT_LOCALE)
      );
      if (hiddenSet.has(key)) {
        groupNodes.forEach((node, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const x = margin + col * (cellW + gapX) + cellW / 2;
          const y = Math.max(margin + cellH / 2, cy.height() - margin - row * (cellH + gapY) - cellH / 2);
          pos.set(node.id(), { x, y });
        });
        continue;
      }
      const rows = Math.ceil(groupNodes.length / cols);
      groupNodes.forEach((node, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const x = margin + col * (cellW + gapX) + cellW / 2;
        const y = yTop + row * (cellH + gapY) + cellH / 2;
        pos.set(node.id(), { x, y });
      });
      yTop += rows * (cellH + gapY) + groupGapY;
    }
    cy.nodes().layout({
      name: "preset",
      animate: true,
      transform: (node) => pos.get(node.id()) ?? { x: w / 2, y: cy.height() / 2 }
    }).run();
    requestAnimationFrame(() => {
      cy.resize();
      cy.fit(void 0, 48);
    });
  }
  function applyGraphTimeLayout(cy, alertFn, layoutOpts, graphLayers) {
    const fn = alertFn ?? ((m) => window.alert(m));
    const valid = cy.nodes().filter((n) => n.data("timeSort") != null);
    if (valid.length === 0) {
      fn("\u8BF7\u5148\u5728\u4FBF\u7B7E\u4E2D\u8BBE\u7F6E\u5F00\u59CB\u5E74\u4EFD\uFF0C\u518D\u4F7F\u7528\u65F6\u95F4\u7EBF\u6392\u5E03\u3002");
      return;
    }
    const biasRaw = layoutOpts?.weightBias ?? 0;
    const bias = Math.max(0, Math.min(1, Number.isFinite(biasRaw) ? biasRaw : 0));
    const times = valid.map((n) => Number(n.data("timeSort")));
    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    const range = maxT - minT || 1;
    const w = cy.width();
    const h = cy.height();
    const bandT = 80;
    const bandB = Math.max(bandT + 40, h - 80);
    const bandH = bandB - bandT;
    const tagKeysFromNodes = /* @__PURE__ */ new Set();
    valid.forEach((node) => {
      const tagKey = String(node.data("tagGroup") ?? "").trim();
      tagKeysFromNodes.add(tagKey);
    });
    const allKeys = tagKeysFromNodes;
    const hiddenSet = new Set((graphLayers?.hidden ?? []).map((h2) => String(h2).trim()));
    const keysOrdered = graphLayers ? orderedTagGroupKeysFromState(allKeys, graphLayers) : [...allKeys].sort((a, b) => {
      if (a === "" && b !== "") return 1;
      if (b === "" && a !== "") return -1;
      return a.localeCompare(b, GRAPH_SORT_LOCALE);
    });
    const keysVisible = keysOrdered.filter((k) => !hiddenSet.has(k));
    const keysForY = keysVisible.length > 0 ? keysVisible : keysOrdered;
    const idxByKey = /* @__PURE__ */ new Map();
    keysForY.forEach((k, i) => idxByKey.set(k, i));
    const denom = Math.max(1, keysForY.length - 1);
    cy.nodes().layout({
      name: "preset",
      animate: true,
      transform: (node) => {
        const t = node.data("timeSort");
        if (t == null) return { x: w / 2, y: h / 2 };
        const x = 80 + (Number(t) - minT) / range * (w - 160);
        const tagKey = String(node.data("tagGroup") ?? "").trim();
        const idx = idxByKey.get(tagKey) ?? 0;
        const norm = keysForY.length <= 1 ? 0 : idx / denom;
        const yTarget = bandT + norm * bandH;
        const maxJitter = bandH * 0.48 * (1 - bias);
        const yRaw = yTarget + (Math.random() - 0.5) * 2 * maxJitter;
        const y = Math.max(bandT, Math.min(bandB, yRaw));
        return { x, y };
      }
    }).run();
  }
  var HL = ["focus-core", "focus-nh", "focus-e"];
  var GRAPH_HOVER_CLASS = "focus-hover";
  function applyGraphNeighborHighlight(cy, centerId, chainLength = 1) {
    cy.batch(() => {
      cy.elements().removeClass([...HL]);
      if (!centerId) return;
      const el = cy.getElementById(centerId);
      if (el.empty() || !el.isNode()) return;
      const depth = Math.max(1, Math.floor(Number.isFinite(chainLength) ? chainLength : 1));
      const nodeIds = /* @__PURE__ */ new Set([centerId]);
      const edgeIds = /* @__PURE__ */ new Set();
      let frontier = /* @__PURE__ */ new Set([centerId]);
      for (let dist = 0; dist < depth; dist += 1) {
        const nextFrontier = /* @__PURE__ */ new Set();
        for (const nodeId of frontier) {
          const nodeEl = cy.getElementById(nodeId);
          if (nodeEl.empty() || !nodeEl.isNode()) continue;
          nodeEl.connectedEdges().forEach((edge) => {
            edgeIds.add(edge.id());
            const ns = edge.connectedNodes();
            if (ns.length !== 2) return;
            const otherId = ns[0].id() === nodeId ? ns[1].id() : ns[0].id();
            if (!nodeIds.has(otherId)) {
              nodeIds.add(otherId);
              nextFrontier.add(otherId);
            }
          });
        }
        frontier = nextFrontier;
        if (frontier.size === 0) break;
      }
      el.addClass("focus-core");
      nodeIds.forEach((id) => {
        if (id === centerId) return;
        const n = cy.getElementById(id);
        if (!n.empty() && n.isNode()) n.addClass("focus-nh");
      });
      edgeIds.forEach((id) => {
        const e = cy.getElementById(id);
        if (!e.empty() && e.isEdge()) e.addClass("focus-e");
      });
    });
  }
  function applyGraphHoverHighlight(cy, hoverNodeId) {
    cy.batch(() => {
      cy.nodes().removeClass(GRAPH_HOVER_CLASS);
      if (!hoverNodeId) return;
      const el = cy.getElementById(hoverNodeId);
      if (!el.empty() && el.isNode()) el.addClass(GRAPH_HOVER_CLASS);
    });
  }
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function wireStandaloneGraphInteractions(cy, payload, themeColor, marked) {
    const previews = payload.notePreviews || {};
    const previewEl = document.getElementById("graph-note-preview");
    let previewImgIdx = 0;
    let focusedId = null;
    let hoverId = null;
    function renderPreview() {
      if (!previewEl) return;
      const id = hoverId || focusedId;
      if (!id) {
        previewEl.classList.add("hidden");
        previewEl.innerHTML = "";
        return;
      }
      const p = previews[id];
      if (!p) {
        previewEl.classList.add("hidden");
        previewEl.innerHTML = "";
        return;
      }
      if (previewImgIdx < 0) previewImgIdx = 0;
      const imgs = [...p.images || []];
      if (p.sketch) imgs.push(p.sketch);
      if (previewImgIdx >= imgs.length) previewImgIdx = 0;
      const timeRange = p.startYear != null ? p.endYear != null && p.endYear !== p.startYear ? `${p.startYear}\u2013${p.endYear}` : String(p.startYear) : "";
      let detailHtml = "";
      if (p.previewDetailMd.trim()) {
        try {
          detailHtml = marked?.parse(p.previewDetailMd) ?? escapeHtml(p.previewDetailMd).replace(/\n/g, "<br/>");
        } catch {
          detailHtml = escapeHtml(p.previewDetailMd).replace(/\n/g, "<br/>");
        }
      }
      const imgSection = imgs.length > 0 ? `<div class="relative aspect-[4/3] bg-gray-100 flex items-center justify-center shrink-0">
            <img src="${escapeHtml(imgs[previewImgIdx])}" class="w-full h-full object-cover" alt="" />
            ${imgs.length > 1 ? `<button type="button" class="km-g-prev absolute left-2 p-1.5 bg-black/30 text-white rounded-full">\u2039</button>
                   <button type="button" class="km-g-next absolute right-2 p-1.5 bg-black/30 text-white rounded-full">\u203A</button>` : ""}
          </div>` : "";
      previewEl.classList.remove("hidden");
      previewEl.innerHTML = `
      <div data-allow-context-menu class="fixed top-4 left-4 z-[1000] w-72 sm:w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden pointer-events-auto flex flex-col" style="max-height:calc(100vh - 2rem)">
        <div class="p-4 pb-2 flex items-start justify-between gap-3 border-b border-gray-100 shrink-0">
          <div class="flex items-start gap-3 flex-1 min-w-0">
            ${p.emoji ? `<span class="text-2xl mt-0.5 shrink-0">${escapeHtml(p.emoji)}</span>` : ""}
            <div class="min-w-0 flex-1">
              <h3 class="text-lg font-bold text-gray-900 leading-tight whitespace-pre-line break-words">${escapeHtml(p.previewTitle)}</h3>
              ${timeRange ? `<div class="mt-1 text-xs text-gray-500 font-medium truncate">${escapeHtml(timeRange)}</div>` : ""}
            </div>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto text-sm">
          ${detailHtml ? `<div class="px-4 py-3 text-gray-800 leading-snug break-words border-b border-gray-50 bg-gray-50/30 mapping-preview-markdown">${detailHtml}</div>` : ""}
          ${imgSection}
        </div>
      </div>`;
      const prev = previewEl.querySelector(".km-g-prev");
      const next = previewEl.querySelector(".km-g-next");
      prev?.addEventListener("click", (e) => {
        e.stopPropagation();
        previewImgIdx = (previewImgIdx - 1 + imgs.length) % imgs.length;
        renderPreview();
      });
      next?.addEventListener("click", (e) => {
        e.stopPropagation();
        previewImgIdx = (previewImgIdx + 1) % imgs.length;
        renderPreview();
      });
    }
    cy.on("mouseover", "node", (evt) => {
      const n = evt.target;
      hoverId = n.id();
      previewImgIdx = 0;
      applyGraphHoverHighlight(cy, hoverId);
      renderPreview();
    });
    cy.on("mouseout", "node", () => {
      hoverId = null;
      applyGraphHoverHighlight(cy, null);
      renderPreview();
    });
    cy.on("tap", "node", (evt) => {
      cy.elements().unselect();
      const n = evt.target;
      const id = n.id();
      if (focusedId === id) {
        focusedId = null;
        applyGraphNeighborHighlight(cy, null);
      } else {
        focusedId = id;
        applyGraphNeighborHighlight(cy, id);
      }
      previewImgIdx = 0;
      applyGraphHoverHighlight(cy, hoverId);
      renderPreview();
    });
    cy.on("tap", "edge", () => {
      cy.elements().unselect();
      focusedId = null;
      applyGraphNeighborHighlight(cy, null);
      renderPreview();
    });
    cy.on("tap", (evt) => {
      if (evt.target === cy) {
        cy.elements().unselect();
        focusedId = null;
        applyGraphNeighborHighlight(cy, null);
        renderPreview();
      }
    });
  }
  function downloadGraphPayloadJson(payload, safeName) {
    const text = JSON.stringify(payload, null, 2);
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${safeName}-graph-data.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function copyGraphPayloadJson(payload, safeName, alertFn = (m) => window.alert(m)) {
    const text = JSON.stringify(payload, null, 2);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => alertFn("\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F"),
        () => downloadGraphPayloadJson(payload, safeName)
      );
    } else {
      downloadGraphPayloadJson(payload, safeName);
    }
  }
  function wireStandaloneGraphControls(cy, payload, safeName) {
    const dl = document.getElementById("btnDlJson");
    const cp = document.getElementById("btnCopyJson");
    if (dl) {
      dl.onclick = (e) => {
        e.stopPropagation();
        downloadGraphPayloadJson(payload, safeName);
      };
    }
    if (cp) {
      cp.onclick = (e) => {
        e.stopPropagation();
        copyGraphPayloadJson(payload, safeName);
      };
    }
    const tagGrid = document.getElementById("btnTagGrid");
    const circle = document.getElementById("btnCircle");
    const time = document.getElementById("btnTime");
    const cose = document.getElementById("btnCose");
    if (tagGrid) tagGrid.onclick = () => applyGraphTagGridLayout(cy);
    if (circle) circle.onclick = () => applyGraphLayout(cy, "circle");
    if (time) time.onclick = () => applyGraphTimeLayout(cy);
    if (cose) cose.onclick = () => applyGraphLayout(cy, "cose-bilkent");
  }

  // graph-standalone-entry.ts
  function main() {
    const boot = window.__KM_GRAPH__;
    const Cy = window.cytoscape;
    if (!boot || !Cy) return;
    try {
      Cy.use(window.cytoscapeCoseBilkent);
    } catch (e) {
      console.warn(e);
    }
    const payload = decodeGraphPayloadFromBase64(boot.b64);
    const container = document.getElementById("cy");
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
})();
