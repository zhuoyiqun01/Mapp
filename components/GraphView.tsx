import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type cytoscape from 'cytoscape';
import { Core, EdgeSingular, NodeSingular } from 'cytoscape';
import { NotePreviewCard } from './map/overlays/NotePreviewCard';
import { NoteEditor } from './NoteEditor';
import { SettingsPanel } from './SettingsPanel';
import type { Connection, Frame, GraphLayerState, Note, Project } from '../types';
import { DEFAULT_THEME_COLOR } from '../constants';
import {
  buildGraphElements,
  buildGraphExportPayload,
  DEFAULT_GRAPH_STYLESHEET_SIZING,
  DEFAULT_GRAPH_TIME_AXIS_WEIGHT_BIAS,
  getGraphStylesheet,
  graphNodeStructureKey,
  applyGraphHighlightLabelScreenSize
} from '../utils/graph/graphData';
import { buildStandaloneGraphHtml, downloadTextFile } from '../utils/graph/graphExportHtml';
import { downloadMappVizJson } from '../utils/export/mappVizJson';
import { attachBoardlikeWheelZoom, createAppGraphCy } from '../utils/graph/graphRuntime';
import {
  applyGraphLayout,
  applyGraphLayoutMode,
  applyGraphTimeLayout,
  coerceGraphLayoutMode,
  DEFAULT_GRAPH_LAYOUT_MODE,
  type GraphLayoutMode,
  type GraphTimeLayoutOptions,
  applyGraphHoverHighlight,
  applyGraphNeighborHighlight,
  collectRelatedEdgeLabelEntries,
  flattenRelatedEdgeLabelGroups,
  type RelatedEdgeLabelColumn,
  attachGraphResizeObserver,
  downloadGraphPayloadJson,
  mergeGraphLayerState,
  patchGraphElementsData,
  scheduleGraphResizeAndFit,
  updateGraphStylesheet,
  animateGraphCenterOnNode,
  buildGraphCoseLayoutOptions,
  applyGraphDualLayerNodeVisibility,
  applyGraphNodeStackZIndex,
  syncGraphEdgeCurveDistances
} from '../utils/graph/graphRuntimeCore';
import { getGraphLayoutCache, setGraphLayoutCache } from '../utils/persistence/storage';
import { GraphConnectionPanel, connectionToPanelDraft, type ConnectionDraft } from './graph/GraphConnectionPanel';
import { GraphHighlightChromeLabels } from './graph/GraphHighlightChromeLabels';
import { GraphRelatedHighlightPanel } from './graph/GraphRelatedHighlightPanel';
import { EditInspectorPanel } from './map/overlays/MapEditInspectorPanel';
import { GraphTopLeftToolbar } from './graph/GraphTopLeftToolbar';
import { GraphTopCenterConnectionButton } from './graph/GraphTopCenterConnectionButton';
import { GraphTopRightToolbar } from './graph/GraphTopRightToolbar';
import { GraphLayoutModeBar } from './graph/GraphLayoutModeBar';
import { generateId } from '../utils';

interface GraphViewProps {
  /** 用于会话内记住图谱二级布局（切换一级视图后再回来仍保留） */
  projectId: string;
  project: Project;
  themeColor?: string;
  /** 完整 UI 时展示 NoteEditor；Tab 预览模式（false）不展示，与导出页一致 */
  isUIVisible?: boolean;
  onUpdateNote: (note: Note) => void;
  onDeleteNote?: (noteId: string) => void;
  onToggleEditor?: (open: boolean) => void;
  onUpdateConnections?: (connections: Connection[]) => void;
  onSwitchToBoardView?: (coords?: { x: number; y: number }) => void;
  onSwitchToMapView?: (coords?: { lat: number; lng: number; zoom?: number }) => void;
  /** Table/其它视图「定位到图谱」：切换进来后聚焦该节点 */
  navigateToGraphNoteId?: string | null;
  onClearGraphNavigation?: () => void;
  panelChromeStyle?: React.CSSProperties;
  chromeHoverBackground?: string;
  onThemeColorChange?: (color: string) => void;
  mapUiChromeOpacity?: number;
  onMapUiChromeOpacityChange?: (opacity: number) => void;
  mapUiChromeBlurPx?: number;
  onMapUiChromeBlurPxChange?: (blurPx: number) => void;
  mapStyleId?: string;
  onMapStyleChange?: (styleId: string) => void;
  onUpdateProject?: (projectOrId: Project | string, updates?: Partial<Project>) => void | Promise<void>;
  /** 与 Map / Board 共用的视图编辑模式（由 App 持有，切换视图时保持） */
  workspaceEditMode: boolean;
  onWorkspaceEditModeChange: (edit: boolean) => void;
}

export const GraphView: React.FC<GraphViewProps> = ({
  projectId,
  project,
  themeColor = DEFAULT_THEME_COLOR,
  isUIVisible = true,
  onUpdateNote,
  onDeleteNote,
  onToggleEditor,
  onUpdateConnections,
  onSwitchToBoardView,
  onSwitchToMapView,
  navigateToGraphNoteId,
  onClearGraphNavigation,
  panelChromeStyle,
  chromeHoverBackground,
  onThemeColorChange,
  mapUiChromeOpacity = 0.9,
  onMapUiChromeOpacityChange,
  mapUiChromeBlurPx = 8,
  onMapUiChromeBlurPxChange,
  mapStyleId = 'carto-light-nolabels',
  onMapStyleChange,
  onUpdateProject,
  workspaceEditMode,
  onWorkspaceEditModeChange
}) => {
  const ch = panelChromeStyle;
  const chHover = chromeHoverBackground;
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const [showTagLayerPanel, setShowTagLayerPanel] = useState(false);
  const [showFrameLayerPanel, setShowFrameLayerPanel] = useState(false);
  const graphTopLeftChromeRef = useRef<HTMLDivElement>(null);
  /** 详情 / 关联面板 top：避开左上角按钮与已展开面板 */
  const [previewOffsetTopPx, setPreviewOffsetTopPx] = useState(64);
  const isGraphToolbarEditMode = workspaceEditMode;
  const containerRef = useRef<HTMLDivElement>(null);
  const graphStageRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  /** cy 实例重建后通知 HTML label 层重新绑定事件 */
  const [graphCyEpoch, setGraphCyEpoch] = useState(0);
  const unbindRef = useRef<(() => void) | null>(null);
  const noteByIdRef = useRef<Map<string, Note>>(new Map());
  const connectionsRef = useRef<Connection[]>([]);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [hoveredNote, setHoveredNote] = useState<Note | null>(null);
  const [chainLength, setChainLength] = useState<number>(1);
  const chainLengthRef = useRef<number>(1);
  chainLengthRef.current = chainLength;
  /** 关联高亮：按边标签临时筛选（默认全选） */
  const [relatedHighlightLabelKeys, setRelatedHighlightLabelKeys] = useState<Set<string>>(
    () => new Set()
  );
  const relatedHighlightLabelKeysRef = useRef(relatedHighlightLabelKeys);
  relatedHighlightLabelKeysRef.current = relatedHighlightLabelKeys;
  const prevRelatedLabelAvailRef = useRef<Set<string>>(new Set());
  const relatedFilterFocusRef = useRef<string | null>(null);
  const mapUiChromeRef = useRef({ opacity: mapUiChromeOpacity, blurPx: mapUiChromeBlurPx });
  mapUiChromeRef.current = { opacity: mapUiChromeOpacity, blurPx: mapUiChromeBlurPx };
  const [previewImageIndex, setPreviewImageIndex] = useState(0);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [hoveredConnectionId, setHoveredConnectionId] = useState<string | null>(null);
  const [edgeLabelDraft, setEdgeLabelDraft] = useState('');
  const [showConnectionPanel, setShowConnectionPanel] = useState(false);
  const showConnectionPanelRef = useRef(showConnectionPanel);
  showConnectionPanelRef.current = showConnectionPanel;
  const [panelEditingKey, setPanelEditingKey] = useState<string | 'new'>('new');
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft>(() => ({
    fromNoteId: '',
    toNoteId: '',
    label: '',
    fromArrow: 'none',
    toArrow: 'arrow'
  }));
  const [pickTarget, setPickTarget] = useState<'from' | 'to' | null>(null);
  /** 图中点选节点后递增，驱动面板清空检索并不聚焦输入框 */
  const [graphPickNonce, setGraphPickNonce] = useState(0);
  /** 关联保存成功后递增，驱动面板成功动效（不关面板，随后进入下一条新建） */
  const [connectionSaveSuccessNonce, setConnectionSaveSuccessNonce] = useState(0);
  /** 保存成功动效与草稿重置期间，禁止重复提交 */
  const [connectionPanelSaveResetting, setConnectionPanelSaveResetting] = useState(false);
  const connectionSaveResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionPanelCommitCooldownRef = useRef(false);
  /** 关联点选 / 单击节点：不打开便签编辑器；双击节点才打开（与 graphNodeTapTimerRef 配合） */
  const [noteEditorSuppressedForGraphConnection, setNoteEditorSuppressedForGraphConnection] =
    useState(false);
  /** 区分节点单击与双击：单击延迟落盘，dbltap 时清除定时器并改为打开编辑器 */
  const graphNodeTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeGraphLayout, setActiveGraphLayout] = useState<GraphLayoutMode>(() => {
    if (projectId) {
      const c = getGraphLayoutCache(projectId);
      if (c) return c;
    }
    return coerceGraphLayoutMode(project.graphDefaultLayoutMode);
  });

  const activeGraphLayoutRef = useRef(activeGraphLayout);
  activeGraphLayoutRef.current = activeGraphLayout;

  /** cytoscape 回调闭包不随 render 更新，用 ref 读连线面板 + 点选模式 */
  const graphUiRef = useRef({
    showConnectionPanel: false,
    pickTarget: null as 'from' | 'to' | null,
    isGraphToolbarEditMode: false
  });
  graphUiRef.current = {
    showConnectionPanel,
    pickTarget,
    isGraphToolbarEditMode: workspaceEditMode
  };

  /** 保存时避免读到过期 connectionDraft / panelEditingKey（批处理或闭包滞后） */
  const connectionDraftRef = useRef(connectionDraft);
  connectionDraftRef.current = connectionDraft;
  const panelEditingKeyRef = useRef(panelEditingKey);
  panelEditingKeyRef.current = panelEditingKey;

  const notes = project.notes || [];
  const connections = project.connections || [];
  connectionsRef.current = connections;

  const graphStylesheetSizing = useMemo(() => {
    const nodeSize = project.graphNodeSize ?? DEFAULT_GRAPH_STYLESHEET_SIZING.nodeSize;
    const labelFontPx = project.graphLabelFontPx ?? DEFAULT_GRAPH_STYLESHEET_SIZING.labelFontPx;
    const edgeWeight = project.graphEdgeWeight ?? DEFAULT_GRAPH_STYLESHEET_SIZING.edgeWeight;
    const edgeLabelFontPx =
      project.graphEdgeLabelFontPx ?? DEFAULT_GRAPH_STYLESHEET_SIZING.edgeLabelFontPx;
    return {
      nodeSize: Math.min(36, Math.max(1, nodeSize)),
      labelFontPx: Math.min(16, Math.max(4, labelFontPx)),
      edgeWeight: Math.min(4, Math.max(0.1, Math.round(edgeWeight * 10) / 10)),
      edgeLabelFontPx: Math.min(16, Math.max(3, Math.round(edgeLabelFontPx)))
    };
  }, [
    project.graphNodeSize,
    project.graphLabelFontPx,
    project.graphEdgeWeight,
    project.graphEdgeLabelFontPx
  ]);
  const graphStylesheetSizingRef = useRef(graphStylesheetSizing);
  graphStylesheetSizingRef.current = graphStylesheetSizing;

  /** 未设置时默认开启 bezier 曲线连线 */
  const graphEdgeCurve = project.graphEdgeCurve !== false;
  const graphEdgeCurveRef = useRef(graphEdgeCurve);
  graphEdgeCurveRef.current = graphEdgeCurve;

  const mergedTagGraphLayers = useMemo(
    () => mergeGraphLayerState(notes, project.graphLayers ?? null, 'tag'),
    [notes, project.graphLayers]
  );

  const mergedFrameGraphLayers = useMemo(
    () => mergeGraphLayerState(notes, project.graphFrameLayers ?? null, 'frame'),
    [notes, project.graphFrameLayers]
  );

  const mergedTagGraphLayersRef = useRef(mergedTagGraphLayers);
  mergedTagGraphLayersRef.current = mergedTagGraphLayers;
  const mergedFrameGraphLayersRef = useRef(mergedFrameGraphLayers);
  mergedFrameGraphLayersRef.current = mergedFrameGraphLayers;

  const syncDualLayerVisibility = useCallback((cy: Core) => {
    const tag = mergedTagGraphLayersRef.current;
    const frame = mergedFrameGraphLayersRef.current;
    applyGraphDualLayerNodeVisibility(
      cy,
      tag.hidden,
      frame.hidden,
      tag.tagVisibilityLogic ?? 'or'
    );
  }, []);

  /** 时间线布局固定使用簇图层 */
  const mergedGraphLayers = mergedFrameGraphLayers;

  const timeLayoutOpts = useMemo(
    (): GraphTimeLayoutOptions => ({
      weightBias: project.graphTimeAxisWeightBias ?? DEFAULT_GRAPH_TIME_AXIS_WEIGHT_BIAS
    }),
    [project.graphTimeAxisWeightBias]
  );

  /** 节点颜色图例：按 Frame 颜色（与图谱节点着色一致） */
  const nodeColorLegendItems = useMemo(() => {
    const frames = project.frames ?? [];
    const framesById = new Map(frames.map((f) => [String(f.id).trim(), f]));
    const usedFrameIds = new Set<string>();
    let hasUnframed = false;
    for (const note of notes) {
      const fid = String(note.groupIds?.[0] ?? note.groupId ?? '').trim();
      if (fid && framesById.has(fid)) usedFrameIds.add(fid);
      else hasUnframed = true;
    }

    const keysInOrder = mergedFrameGraphLayers.order ?? [];
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const k of keysInOrder) {
      const key = String(k).trim();
      if (!key) continue;
      if (usedFrameIds.has(key) && !seen.has(key)) {
        ordered.push(key);
        seen.add(key);
      }
    }
    const rest = [...usedFrameIds]
      .filter((k) => !seen.has(k))
      .sort((a, b) => {
        const ta = framesById.get(a)?.title ?? a;
        const tb = framesById.get(b)?.title ?? b;
        return ta.localeCompare(tb, 'zh-Hans-CN');
      });

    const items = [...ordered, ...rest].map((id) => {
      const f = framesById.get(id);
      const color = (f?.color ?? themeColor).toString().trim() || themeColor;
      return {
        key: id,
        label: f?.title?.trim() || id,
        colors: [color]
      };
    });

    if (hasUnframed) {
      items.push({
        key: '__no_frame__',
        label: '无簇',
        colors: [themeColor]
      });
    }

    return items;
  }, [notes, themeColor, project.frames, mergedFrameGraphLayers.order]);

  const legendLabelFontPx = graphStylesheetSizing.labelFontPx;

  const handleTagLayersChange = useCallback(
    (next: GraphLayerState) => {
      if (!onUpdateProject || !projectId) return;
      void onUpdateProject(projectId, { graphLayers: next });
    },
    [onUpdateProject, projectId]
  );

  const handleFrameLayersChange = useCallback(
    (next: GraphLayerState) => {
      if (!onUpdateProject || !projectId) return;
      void onUpdateProject(projectId, { graphFrameLayers: next });
    },
    [onUpdateProject, projectId]
  );

  const handleUpdateFrame = useCallback(
    (frame: Frame) => {
      if (!onUpdateProject || !projectId) return;
      const frames = (project.frames ?? []).map((f) => (f.id === frame.id ? frame : f));
      void onUpdateProject(projectId, { frames });
    },
    [onUpdateProject, projectId, project.frames]
  );

  const handleUpdateFrames = useCallback(
    (frames: Frame[]) => {
      if (!onUpdateProject || !projectId) return;
      void onUpdateProject(projectId, { frames });
    },
    [onUpdateProject, projectId]
  );

  /** 批量更新便签 notes：避免多次 updateNote 基于同一快照导致互相覆盖 */
  const handleBatchUpdateNotes = useCallback(
    async (nextNotes: Note[]) => {
      if (!onUpdateProject) return;
      await onUpdateProject({ ...project, notes: nextNotes });
    },
    [onUpdateProject, project]
  );

  const graphLayersHiddenKey = useMemo(
    () => mergedGraphLayers.hidden.slice().sort().join('\u0001'),
    [mergedGraphLayers.hidden]
  );

  const graphLayersOrderKey = useMemo(
    () => (mergedGraphLayers.order ?? []).join('\u0001'),
    [mergedGraphLayers.order]
  );

  const tagGraphLayersHiddenKey = useMemo(
    () => mergedTagGraphLayers.hidden.slice().sort().join('\u0001'),
    [mergedTagGraphLayers.hidden]
  );

  const tagGraphLayersOrderKey = useMemo(
    () => (mergedTagGraphLayers.order ?? []).join('\u0001'),
    [mergedTagGraphLayers.order]
  );

  const tagGraphLayersWeightsKey = useMemo(
    () =>
      Object.entries(mergedTagGraphLayers.weights ?? {})
        .sort(([a], [b]) => a.localeCompare(b, 'zh-Hans-CN'))
        .map(([k, v]) => `${k}:${v}`)
        .join('\u0001'),
    [mergedTagGraphLayers.weights]
  );

  const frameGraphLayersHiddenKey = useMemo(
    () => mergedFrameGraphLayers.hidden.slice().sort().join('\u0001'),
    [mergedFrameGraphLayers.hidden]
  );

  const frameGraphLayersOrderKey = useMemo(
    () => (mergedFrameGraphLayers.order ?? []).join('\u0001'),
    [mergedFrameGraphLayers.order]
  );

  const dragForceLayoutRef = useRef<{ stop?: () => void } | null>(null);
  const dragForceNodeIdRef = useRef<string | null>(null);
  const dragLastPosRef = useRef<{ x: number; y: number } | null>(null);

  const selectedConn = useMemo(
    () =>
      selectedConnectionId ? connections.find((c) => c.id === selectedConnectionId) ?? null : null,
    [connections, selectedConnectionId]
  );

  const persistGraphLayout = useCallback(
    (mode: GraphLayoutMode) => {
      if (projectId) setGraphLayoutCache(projectId, mode);
    },
    [projectId]
  );

  useEffect(() => {
    if (!projectId) {
      setActiveGraphLayout(coerceGraphLayoutMode(project.graphDefaultLayoutMode));
      return;
    }
    setActiveGraphLayout(
      getGraphLayoutCache(projectId) ?? coerceGraphLayoutMode(project.graphDefaultLayoutMode)
    );
  }, [projectId, project.graphDefaultLayoutMode]);

  const nodeStructureKey = useMemo(() => graphNodeStructureKey(notes), [notes]);
  /** 单节点图层显隐 / 叠放序变化时需重跑显隐与 z-index（不依赖节点增删） */
  const notesLayerVisualKey = useMemo(
    () =>
      notes
        .map(
          (n) =>
            `${n.id}\u0001${n.layerItemHidden ? 1 : 0}\u0001${n.layerStackOrder ?? n.createdAt}`
        )
        .sort()
        .join('\u0002'),
    [notes]
  );
  const edgeStructureKey = useMemo(
    () => connections.map((c) => c.id).slice().sort().join('\u0001'),
    [connections]
  );

  const noteById = useMemo(() => {
    const m = new Map<string, Note>();
    notes.forEach((n) => m.set(n.id, n));
    return m;
  }, [notes]);
  noteByIdRef.current = noteById;

  const clearSelection = useCallback(() => {
    if (graphNodeTapTimerRef.current) {
      clearTimeout(graphNodeTapTimerRef.current);
      graphNodeTapTimerRef.current = null;
    }
    const cy = cyRef.current;
    setFocusedNodeId(null);
    setHoveredNote(null);
    setHoveredConnectionId(null);
    setSelectedConnectionId(null);
    setEdgeLabelDraft('');
    setNoteEditorSuppressedForGraphConnection(false);
    if (cy) {
      cy.elements().unselect();
      applyGraphNeighborHighlight(cy, null, chainLengthRef.current, null);
      syncDualLayerVisibility(cy);
    }
  }, [syncDualLayerVisibility]);

  /** 关闭节点编辑器但保留 hover（用于 NoteEditor 关闭/保存后） */
  const closeGraphNoteEditor = useCallback(() => {
    const cy = cyRef.current;
    setFocusedNodeId(null);
    setNoteEditorSuppressedForGraphConnection(false);
    if (cy) {
      cy.elements().unselect();
      applyGraphNeighborHighlight(cy, null, chainLengthRef.current, null);
      syncDualLayerVisibility(cy);
    }
    onToggleEditor?.(false);
  }, [onToggleEditor, syncDualLayerVisibility]);

  const focusedNote = useMemo(
    () => (focusedNodeId ? noteById.get(focusedNodeId) ?? null : null),
    [focusedNodeId, noteById]
  );

  const relatedEdgeLabelGroups = useMemo(() => {
    if (!focusedNodeId) return { from: [], to: [] };
    return collectRelatedEdgeLabelEntries(focusedNodeId, connections, chainLength);
  }, [focusedNodeId, connections, chainLength]);

  const relatedEdgeLabelEntries = useMemo(
    () => flattenRelatedEdgeLabelGroups(relatedEdgeLabelGroups),
    [relatedEdgeLabelGroups]
  );

  const relatedHighlightKeysSig = useMemo(
    () => Array.from(relatedHighlightLabelKeys).sort().join('\u0001'),
    [relatedHighlightLabelKeys]
  );

  /** 切换选中点 / 关系链变化：重建标签；已有键保留勾选，新增键默认勾选 */
  useEffect(() => {
    if (!focusedNodeId) {
      relatedFilterFocusRef.current = null;
      prevRelatedLabelAvailRef.current = new Set();
      setRelatedHighlightLabelKeys(new Set());
      return;
    }
    const availableKeys = relatedEdgeLabelEntries.map((e) => e.key);
    const focusChanged = relatedFilterFocusRef.current !== focusedNodeId;
    relatedFilterFocusRef.current = focusedNodeId;
    setRelatedHighlightLabelKeys((prev) => {
      if (focusChanged) return new Set(availableKeys);
      const prevAvail = prevRelatedLabelAvailRef.current;
      const next = new Set<string>();
      for (const key of availableKeys) {
        if (!prevAvail.has(key) || prev.has(key)) next.add(key);
      }
      return next;
    });
    prevRelatedLabelAvailRef.current = new Set(availableKeys);
  }, [focusedNodeId, relatedEdgeLabelEntries]);

  const allRelatedLabelKeysFor = useCallback((noteId: string) => {
    const groups = collectRelatedEdgeLabelEntries(
      noteId,
      connectionsRef.current,
      chainLengthRef.current
    );
    return new Set(flattenRelatedEdgeLabelGroups(groups).map((e) => e.key));
  }, []);

  const applyNeighborHighlightNow = useCallback(
    (cy: Core, noteId: string | null, keys?: Set<string> | null) => {
      if (!noteId) {
        applyGraphNeighborHighlight(cy, null, chainLengthRef.current, null);
        syncDualLayerVisibility(cy);
        return;
      }
      const allow =
        keys !== undefined ? keys : relatedHighlightLabelKeysRef.current;
      applyGraphNeighborHighlight(cy, noteId, chainLengthRef.current, allow);
      // 高亮后再同步显隐：临时显示被高亮的隐藏节点；取消勾选后恢复隐藏
      syncDualLayerVisibility(cy);
    },
    [syncDualLayerVisibility]
  );

  const toggleRelatedLabelKey = useCallback((key: string) => {
    setRelatedHighlightLabelKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleRelatedColumn = useCallback(
    (column: RelatedEdgeLabelColumn) => {
      const entries = column === 'from' ? relatedEdgeLabelGroups.from : relatedEdgeLabelGroups.to;
      const keys = entries.map((e) => e.key);
      if (keys.length === 0) return;
      setRelatedHighlightLabelKeys((prev) => {
        const allOn = keys.every((k) => prev.has(k));
        const next = new Set(prev);
        if (allOn) keys.forEach((k) => next.delete(k));
        else keys.forEach((k) => next.add(k));
        return next;
      });
    },
    [relatedEdgeLabelGroups]
  );

  const selectAllRelatedLabels = useCallback(() => {
    setRelatedHighlightLabelKeys(new Set(relatedEdgeLabelEntries.map((e) => e.key)));
  }, [relatedEdgeLabelEntries]);

  const clearAllRelatedLabels = useCallback(() => {
    setRelatedHighlightLabelKeys(new Set());
  }, []);

  const previewNote = hoveredNote ?? focusedNote;

  const emptyConnectionDraft = useCallback(
    (): ConnectionDraft => ({
      fromNoteId: '',
      toNoteId: '',
      label: '',
      fromArrow: project.graphNewConnectionFromArrow ?? 'none',
      toArrow: project.graphNewConnectionToArrow ?? 'arrow'
    }),
    [project.graphNewConnectionFromArrow, project.graphNewConnectionToArrow]
  );

  const toggleConnectionPanel = useCallback(() => {
    if (showConnectionPanelRef.current) {
      setPickTarget(null);
      setShowConnectionPanel(false);
      return;
    }
    // 顶部「关联」打开面板时统一进入新建草稿，避免仍保留上次点选边的 editingKey，
    // 面板误呈「编辑连线」态（起点右侧减号等）。
    setPanelEditingKey('new');
    setConnectionDraft(emptyConnectionDraft());
    setPickTarget(null);
    setSelectedConnectionId(null);
    setEdgeLabelDraft('');
    setShowConnectionPanel(true);
  }, [emptyConnectionDraft]);

  const handleNewConnection = useCallback(() => {
    if (connectionSaveResetTimerRef.current) {
      clearTimeout(connectionSaveResetTimerRef.current);
      connectionSaveResetTimerRef.current = null;
    }
    connectionPanelCommitCooldownRef.current = false;
    setConnectionPanelSaveResetting(false);
    setPanelEditingKey('new');
    setConnectionDraft(emptyConnectionDraft());
    setPickTarget(null);
  }, [emptyConnectionDraft]);

  /** 保留关联面板打开：仅清除边选中、画布节点高亮与草稿起终点（减号） */
  const clearConnectionGraphAndDraft = useCallback(() => {
    const cy = cyRef.current;
    setSelectedConnectionId(null);
    setEdgeLabelDraft('');
    setFocusedNodeId(null);
    setHoveredNote(null);
    setPickTarget(null);
    setNoteEditorSuppressedForGraphConnection(false);
    if (cy) {
      cy.elements().unselect();
      applyGraphNeighborHighlight(cy, null, chainLengthRef.current, null);
      syncDualLayerVisibility(cy);
    }
    // 已是「新建」时：只清起终点与图状态，不要整份 emptyConnectionDraft（否则等同再点一次「新建」）
    if (panelEditingKeyRef.current === 'new') {
      setConnectionDraft((d) => ({
        ...d,
        fromNoteId: '',
        toNoteId: ''
      }));
      return;
    }
    setPanelEditingKey('new');
    setConnectionDraft(emptyConnectionDraft());
  }, [emptyConnectionDraft, syncDualLayerVisibility]);

  /** 清起点：切到新建并保留终点/标签/箭头设置 */
  const clearConnectionFromOnly = useCallback(() => {
    const cy = cyRef.current;
    setSelectedConnectionId(null);
    setEdgeLabelDraft('');
    setFocusedNodeId(null);
    setHoveredNote(null);
    setPickTarget(null);
    setNoteEditorSuppressedForGraphConnection(false);
    if (cy) {
      cy.elements().unselect();
      applyGraphNeighborHighlight(cy, null, chainLengthRef.current, null);
      syncDualLayerVisibility(cy);
    }
    setPanelEditingKey('new');
    setConnectionDraft((d) => ({ ...d, fromNoteId: '' }));
  }, [syncDualLayerVisibility]);

  /** 清终点：切到新建并保留起点/标签/箭头设置 */
  const clearConnectionToOnly = useCallback(() => {
    const cy = cyRef.current;
    setSelectedConnectionId(null);
    setEdgeLabelDraft('');
    setFocusedNodeId(null);
    setHoveredNote(null);
    setPickTarget(null);
    setNoteEditorSuppressedForGraphConnection(false);
    if (cy) {
      cy.elements().unselect();
      applyGraphNeighborHighlight(cy, null, chainLengthRef.current, null);
      syncDualLayerVisibility(cy);
    }
    setPanelEditingKey('new');
    setConnectionDraft((d) => ({ ...d, toNoteId: '' }));
  }, [syncDualLayerVisibility]);

  /** 关联面板内点击已选便签标题：图中定位并高亮，不打开便签编辑器 */
  const focusNoteOnGraphFromPanel = useCallback((noteId: string) => {
    const cy = cyRef.current;
    setFocusedNodeId(noteId);
    setNoteEditorSuppressedForGraphConnection(true);
    if (cy) {
      applyNeighborHighlightNow(cy, noteId, allRelatedLabelKeysFor(noteId));
      requestAnimationFrame(() => animateGraphCenterOnNode(cy, noteId));
    }
  }, [allRelatedLabelKeysFor, applyNeighborHighlightNow]);

  /** 属性面板「编辑便签」：解除图谱单选节点时的编辑器抑制，以便打开全文编辑器 */
  const openInspectorNoteEditor = useCallback((noteId: string) => {
    setNoteEditorSuppressedForGraphConnection(false);
    setFocusedNodeId(noteId);
  }, []);

  /** 浏览态详情卡：打开全文编辑器（不进入视图编辑模式） */
  const openPreviewNoteEditor = useCallback((noteId: string) => {
    setSelectedConnectionId(null);
    setEdgeLabelDraft('');
    setHoveredNote(null);
    setNoteEditorSuppressedForGraphConnection(false);
    setFocusedNodeId(noteId);
  }, []);

  /** 非点选状态下点加号：一键把当前图中选中节点写入起点/终点 */
  const addEndpointFromFocusedGraphNode = useCallback((which: 'from' | 'to', noteId: string) => {
    const cy = cyRef.current;
    const field = which === 'from' ? 'fromNoteId' : 'toNoteId';
    setSelectedConnectionId(null);
    setEdgeLabelDraft('');
    setConnectionDraft((d) => ({ ...d, [field]: noteId }));
    setPickTarget(null);
    setFocusedNodeId(noteId);
    setNoteEditorSuppressedForGraphConnection(true);
    setGraphPickNonce((n) => n + 1);
    if (cy) {
      applyNeighborHighlightNow(cy, noteId, allRelatedLabelKeysFor(noteId));
      requestAnimationFrame(() => animateGraphCenterOnNode(cy, noteId));
    }
  }, [allRelatedLabelKeysFor, applyNeighborHighlightNow]);

  const handleInspectorNewConnection = useCallback(() => {
    if (connectionSaveResetTimerRef.current) {
      clearTimeout(connectionSaveResetTimerRef.current);
      connectionSaveResetTimerRef.current = null;
    }
    connectionPanelCommitCooldownRef.current = false;
    setConnectionPanelSaveResetting(false);
    setSelectedConnectionId(null);
    setEdgeLabelDraft('');
    setPanelEditingKey('new');
    const base = emptyConnectionDraft();
    if (focusedNodeId) {
      setConnectionDraft({ ...base, fromNoteId: focusedNodeId });
      setPickTarget('to');
    } else {
      setConnectionDraft(base);
      setPickTarget(null);
    }
    setShowConnectionPanel(true);
  }, [emptyConnectionDraft, focusedNodeId]);

  const handleInspectorEditConnection = useCallback((c: Connection) => {
    setSelectedConnectionId(c.id);
    setEdgeLabelDraft(c.label || '');
    setConnectionDraft(connectionToPanelDraft(c));
    setPanelEditingKey(c.id);
    setPickTarget(null);
    setShowConnectionPanel(true);
  }, []);

  const commitConnectionDraft = useCallback(() => {
    if (!onUpdateConnections) return;
    if (connectionPanelCommitCooldownRef.current) return;
    const draft = connectionDraftRef.current;
    const editingKey = panelEditingKeyRef.current;
    const { fromNoteId, toNoteId, label, fromArrow, toArrow } = draft;
    if (!fromNoteId || !toNoteId) {
      window.alert('请选择起点和终点后再保存。');
      return;
    }
    if (fromNoteId === toNoteId) {
      window.alert('起点与终点不能是同一便签。');
      return;
    }

    const trimmedLabel = label.trim();
    const arrow: Connection['arrow'] =
      toArrow === 'arrow' && fromArrow === 'none'
        ? 'forward'
        : fromArrow === 'arrow' && toArrow === 'none'
          ? 'reverse'
          : 'none';

    const conns = connectionsRef.current;

    if (editingKey === 'new') {
      const newConn: Connection = {
        id: generateId(),
        fromNoteId,
        toNoteId,
        fromSide: 'bottom',
        toSide: 'top',
        label: trimmedLabel || undefined,
        fromArrow,
        toArrow,
        arrow
      };
      onUpdateConnections([...conns, newConn]);
    } else {
      const existing = conns.find((c) => c.id === editingKey);
      if (!existing) {
        window.alert('当前编辑的连线已不存在，请关闭面板后重试。');
        return;
      }
      onUpdateConnections(
        conns.map((c) =>
          c.id === editingKey
            ? {
                ...c,
                fromNoteId,
                toNoteId,
                label: trimmedLabel || undefined,
                fromArrow,
                toArrow,
                arrow
              }
            : c
        )
      );
    }
    connectionPanelCommitCooldownRef.current = true;
    setSelectedConnectionId(null);
    setEdgeLabelDraft('');
    setConnectionPanelSaveResetting(true);
    setConnectionSaveSuccessNonce((n) => n + 1);
    setPickTarget(null);
    if (connectionSaveResetTimerRef.current) clearTimeout(connectionSaveResetTimerRef.current);
    // 较原 1280ms 提前 0.5s 进入下一条新建，不必等成功动效播完
    connectionSaveResetTimerRef.current = setTimeout(() => {
      connectionSaveResetTimerRef.current = null;
      handleNewConnection();
      setGraphPickNonce((n) => n + 1);
    }, 780);
  }, [onUpdateConnections, handleNewConnection]);

  const handleDeleteConnection = useCallback(() => {
    if (!onUpdateConnections || panelEditingKey === 'new') return;
    onUpdateConnections(connections.filter((c) => c.id !== panelEditingKey));
    setShowConnectionPanel(false);
    setPickTarget(null);
    setPanelEditingKey('new');
  }, [onUpdateConnections, panelEditingKey, connections]);

  const bindCyEvents = useCallback(
    (cy: Core) => {
      const onNodeTap = (evt: cytoscape.EventObject) => {
        const n = evt.target as NodeSingular;
        const id = n.id();

        cy.elements().unselect();
        const ui = graphUiRef.current;
        if (ui.showConnectionPanel && ui.isGraphToolbarEditMode && ui.pickTarget) {
          const field = ui.pickTarget === 'from' ? 'fromNoteId' : 'toNoteId';
          setSelectedConnectionId(null);
          setEdgeLabelDraft('');
          setPanelEditingKey('new');
          // 必须合并当前草稿：先选起点再选终点时不能再用 empty 覆盖，否则会丢掉已选的一侧
          setConnectionDraft((d) => ({
            ...d,
            [field]: id
          }));
          setPickTarget(null);
          setFocusedNodeId(id);
          setNoteEditorSuppressedForGraphConnection(true);
          setGraphPickNonce((n) => n + 1);
          applyGraphNeighborHighlight(
            cy,
            id,
            chainLengthRef.current,
            new Set(
              flattenRelatedEdgeLabelGroups(
                collectRelatedEdgeLabelEntries(
                  id,
                  connectionsRef.current,
                  chainLengthRef.current
                )
              ).map((e) => e.key)
            )
          );
          syncDualLayerVisibility(cy);
          requestAnimationFrame(() => {
            animateGraphCenterOnNode(cy, id);
          });
          return;
        }
        if (graphNodeTapTimerRef.current) {
          clearTimeout(graphNodeTapTimerRef.current);
          graphNodeTapTimerRef.current = null;
        }
        graphNodeTapTimerRef.current = setTimeout(() => {
          graphNodeTapTimerRef.current = null;
          setSelectedConnectionId(null);
          setEdgeLabelDraft('');
          setNoteEditorSuppressedForGraphConnection(true);
          setFocusedNodeId((prev) => (prev === id ? null : id));
        }, 280);
      };

      const onNodeDblTap = (evt: cytoscape.EventObject) => {
        const ui = graphUiRef.current;
        if (ui.showConnectionPanel && ui.isGraphToolbarEditMode && ui.pickTarget) {
          return;
        }
        if (graphNodeTapTimerRef.current) {
          clearTimeout(graphNodeTapTimerRef.current);
          graphNodeTapTimerRef.current = null;
        }
        cy.elements().unselect();
        const n = evt.target as NodeSingular;
        if (n.hasClass('frame-cluster-label') || n.hasClass('frame-cluster-halo')) {
          return;
        }
        const id = n.id();
        setSelectedConnectionId(null);
        setEdgeLabelDraft('');
        setNoteEditorSuppressedForGraphConnection(false);
        setFocusedNodeId(id);
        applyGraphNeighborHighlight(
          cy,
          id,
          chainLengthRef.current,
          new Set(
            flattenRelatedEdgeLabelGroups(
              collectRelatedEdgeLabelEntries(
                id,
                connectionsRef.current,
                chainLengthRef.current
              )
            ).map((e) => e.key)
          )
        );
        syncDualLayerVisibility(cy);
      };

      const onEdgeTap = (evt: cytoscape.EventObject) => {
        if (graphNodeTapTimerRef.current) {
          clearTimeout(graphNodeTapTimerRef.current);
          graphNodeTapTimerRef.current = null;
        }
        cy.elements().unselect();
        const e = evt.target as EdgeSingular;
        const id = e.id();
        const c = connectionsRef.current.find((x) => x.id === id);
        setFocusedNodeId(null);
        setHoveredConnectionId(null);
        setNoteEditorSuppressedForGraphConnection(false);
        applyGraphNeighborHighlight(cy, null, chainLengthRef.current, null);
        syncDualLayerVisibility(cy);
        if (c) {
          setSelectedConnectionId(id);
          setEdgeLabelDraft(c.label || '');
          setConnectionDraft(connectionToPanelDraft(c));
          setPanelEditingKey(c.id);
          setPickTarget(null);
          if (graphUiRef.current.isGraphToolbarEditMode) {
            setShowConnectionPanel(true);
          }
        } else {
          setSelectedConnectionId(null);
          setEdgeLabelDraft('');
        }
      };

      const onBgTap = (evt: cytoscape.EventObject) => {
        if (evt.target !== cy) return;
        cy.elements().unselect();
        clearSelection();
      };

      const onBgDblTap = (evt: cytoscape.EventObject) => {
        if (evt.target !== cy) return;
        if (!graphUiRef.current.showConnectionPanel) return;
        if (connectionSaveResetTimerRef.current) {
          clearTimeout(connectionSaveResetTimerRef.current);
          connectionSaveResetTimerRef.current = null;
        }
        connectionPanelCommitCooldownRef.current = false;
        setConnectionPanelSaveResetting(false);
        setShowConnectionPanel(false);
        setPickTarget(null);
        clearSelection();
      };

      const onNodeOver = (evt: cytoscape.EventObject) => {
        const n = evt.target as NodeSingular;
        if (n.hasClass('frame-cluster-label') || n.hasClass('frame-cluster-halo')) {
          setHoveredNote(null);
          setPreviewImageIndex(0);
          return;
        }
        const note = noteByIdRef.current.get(n.id());
        setHoveredNote(note || null);
        setPreviewImageIndex(0);
      };

      const onNodeOut = () => {
        setHoveredNote(null);
      };

      const onEdgeOver = (evt: cytoscape.EventObject) => {
        const e = evt.target as EdgeSingular;
        setHoveredConnectionId(e.id());
      };

      const onEdgeOut = () => {
        setHoveredConnectionId(null);
      };

      cy.on('tap', 'node', onNodeTap);
      cy.on('dbltap', 'node', onNodeDblTap);
      cy.on('tap', 'edge', onEdgeTap);
      cy.on('tap', onBgTap);
      cy.on('dbltap', onBgDblTap);
      cy.on('mouseover', 'node', onNodeOver);
      cy.on('mouseout', 'node', onNodeOut);
      cy.on('mouseover', 'edge', onEdgeOver);
      cy.on('mouseout', 'edge', onEdgeOut);

      return () => {
        if (graphNodeTapTimerRef.current) {
          clearTimeout(graphNodeTapTimerRef.current);
          graphNodeTapTimerRef.current = null;
        }
        cy.removeListener('tap', 'node', onNodeTap);
        cy.removeListener('dbltap', 'node', onNodeDblTap);
        cy.removeListener('tap', 'edge', onEdgeTap);
        cy.removeListener('tap', onBgTap);
        cy.removeListener('dbltap', onBgDblTap);
        cy.removeListener('mouseover', 'node', onNodeOver);
        cy.removeListener('mouseout', 'node', onNodeOut);
        cy.removeListener('mouseover', 'edge', onEdgeOver);
        cy.removeListener('mouseout', 'edge', onEdgeOut);
      };
    },
    [clearSelection, emptyConnectionDraft, syncDualLayerVisibility]
  );

  useEffect(() => {
    // 仅在节点/连线 id 集合变化时重建；便签内容与主题色由下一 effect 同步
    setFocusedNodeId(null);
    setNoteEditorSuppressedForGraphConnection(false);
    setHoveredNote(null);
    const el = containerRef.current;
    if (!el) return;

    unbindRef.current?.();
    unbindRef.current = null;
    cyRef.current?.destroy();
    cyRef.current = null;

    const cy = createAppGraphCy(el, {
      elements: buildGraphElements(
        notes,
        connections,
        themeColor,
        graphStylesheetSizing.edgeWeight,
        mergedTagGraphLayers.weights,
        project.frames ?? [],
        graphStylesheetSizing.nodeSize
      ),
      style: getGraphStylesheet(
        themeColor,
        graphStylesheetSizing,
        {
          opacity: mapUiChromeOpacity,
          blurPx: mapUiChromeBlurPx
        },
        { edgeCurve: graphEdgeCurve }
      )
    });
    const cached = projectId ? getGraphLayoutCache(projectId) : null;
    let initialMode = coerceGraphLayoutMode(
      cached ?? project.graphDefaultLayoutMode ?? DEFAULT_GRAPH_LAYOUT_MODE
    );
    applyGraphLayoutMode(cy, initialMode, {
      silentTimeFallback: true,
      timeLayout: timeLayoutOpts,
      graphLayers: mergedFrameGraphLayers,
      graphLayerGroupStandard: 'frame'
    });
    if (initialMode === 'time') {
      const valid = cy.nodes().filter((n) => n.data('timeSort') != null);
      if (valid.length === 0) {
        initialMode = 'cose';
        applyGraphLayout(cy, 'fcose');
        if (projectId) setGraphLayoutCache(projectId, 'cose');
      }
    }
    setActiveGraphLayout(initialMode);
    cyRef.current = cy;
    setGraphCyEpoch((n) => n + 1);
    unbindRef.current = bindCyEvents(cy);

    const detachWheel = attachBoardlikeWheelZoom(cy);

    let labelSizeRaf: number | null = null;
    const syncHighlightLabelSize = () => {
      if (labelSizeRaf != null) return;
      labelSizeRaf = requestAnimationFrame(() => {
        labelSizeRaf = null;
        if (cy.destroyed()) return;
        applyGraphHighlightLabelScreenSize(cy, graphStylesheetSizingRef.current, mapUiChromeRef.current);
      });
    };
    cy.on('viewport', syncHighlightLabelSize);
    applyGraphHighlightLabelScreenSize(cy, graphStylesheetSizingRef.current, mapUiChromeRef.current);

    let curveRaf: number | null = null;
    const syncCurveFromLength = () => {
      if (curveRaf != null) return;
      curveRaf = requestAnimationFrame(() => {
        curveRaf = null;
        if (cy.destroyed()) return;
        if (graphEdgeCurveRef.current) syncGraphEdgeCurveDistances(cy);
      });
    };
    cy.on('position', syncCurveFromLength);
    cy.on('layoutstop', syncCurveFromLength);
    if (graphEdgeCurveRef.current) syncGraphEdgeCurveDistances(cy);

    const detachRo = attachGraphResizeObserver(cy, el);
    scheduleGraphResizeAndFit(cy);

    return () => {
      if (labelSizeRaf != null) cancelAnimationFrame(labelSizeRaf);
      if (curveRaf != null) cancelAnimationFrame(curveRaf);
      cy.removeListener('viewport', syncHighlightLabelSize);
      cy.removeListener('position', syncCurveFromLength);
      cy.removeListener('layoutstop', syncCurveFromLength);
      detachWheel();
      detachRo();
      unbindRef.current?.();
      unbindRef.current = null;
      cyRef.current?.destroy();
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅节点结构变化时重建；连线由增量同步，不触发布局刷新
  }, [nodeStructureKey, bindCyEvents, projectId]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    // 保证新增/删除 edge 能增量反映到 cytoscape，但不重建/不重跑布局。
    const elements = buildGraphElements(
      notes,
      connections,
      themeColor,
      graphStylesheetSizing.edgeWeight,
      mergedTagGraphLayers.weights,
      project.frames ?? [],
      graphStylesheetSizing.nodeSize
    );
    const desiredEdges = elements.filter((el) => {
      const d = (el as any).data as any;
      return d && typeof d.id === 'string' && d.source != null && d.target != null;
    });
    const desiredEdgeIds = new Set(desiredEdges.map((e) => (e as any).data.id as string));
    cy.batch(() => {
      cy.edges().forEach((edge) => {
        if (!desiredEdgeIds.has(edge.id())) edge.remove();
      });
      desiredEdges.forEach((edgeDef) => {
        const id = (edgeDef as any).data.id as string;
        if (cy.getElementById(id).empty()) cy.add(edgeDef as any);
      });
    });

    updateGraphStylesheet(
      cy,
      getGraphStylesheet(
        themeColor,
        graphStylesheetSizing,
        {
          opacity: mapUiChromeOpacity,
          blurPx: mapUiChromeBlurPx
        },
        { edgeCurve: graphEdgeCurve }
      )
    );
    applyGraphHighlightLabelScreenSize(cy, graphStylesheetSizing, {
      opacity: mapUiChromeOpacity,
      blurPx: mapUiChromeBlurPx
    });
    patchGraphElementsData(cy, elements);
    if (graphEdgeCurve) syncGraphEdgeCurveDistances(cy);
    applyGraphNeighborHighlight(
      cy,
      focusedNodeId,
      chainLength,
      focusedNodeId ? relatedHighlightLabelKeysRef.current : null
    );
    syncDualLayerVisibility(cy);
    applyGraphHoverHighlight(cy, hoveredNote?.id ?? null);
    requestAnimationFrame(() => {
      cy.resize();
    });
  }, [
    notes,
    connections,
    themeColor,
    focusedNodeId,
    hoveredNote?.id,
    graphStylesheetSizing,
    graphEdgeCurve,
    chainLength,
    mapUiChromeOpacity,
    mapUiChromeBlurPx,
    tagGraphLayersWeightsKey,
    syncDualLayerVisibility
  ]);

  /** 边标签筛选变化时单独刷新高亮（避免整图数据重同步） */
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed?.()) return;
    applyGraphNeighborHighlight(
      cy,
      focusedNodeId,
      chainLength,
      focusedNodeId ? relatedHighlightLabelKeys : null
    );
    syncDualLayerVisibility(cy);
  }, [
    focusedNodeId,
    chainLength,
    relatedHighlightKeysSig,
    relatedHighlightLabelKeys,
    graphCyEpoch,
    syncDualLayerVisibility
  ]);

  // edge 被删除后：避免继续编辑/选中一个已不存在的 edge
  useEffect(() => {
    if (panelEditingKey === 'new') return;
    const exists = connections.some((c) => c.id === panelEditingKey);
    if (!exists) setPanelEditingKey('new');
  }, [connections, panelEditingKey]);

  useEffect(() => {
    if (!selectedConnectionId) return;
    const exists = connections.some((c) => c.id === selectedConnectionId);
    if (!exists) setSelectedConnectionId(null);
  }, [connections, selectedConnectionId]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.edges().removeClass('focus-edge-hover');
      cy.edges().removeClass('focus-edge-selected');
      cy.nodes().removeClass('focus-edge-endpoint');
      if (hoveredConnectionId) {
        const e = cy.getElementById(hoveredConnectionId);
        if (!e.empty() && e.isEdge()) e.addClass('focus-edge-hover');
      }
      if (selectedConnectionId) {
        const e = cy.getElementById(selectedConnectionId);
        if (!e.empty() && e.isEdge()) {
          e.addClass('focus-edge-selected');
          e.connectedNodes().forEach((n) => {
            if (n.isNode() && !n.hasClass('frame-cluster-label') && !n.hasClass('frame-cluster-halo')) {
              n.addClass('focus-edge-endpoint');
            }
          });
        }
      }
    });
    applyGraphNodeStackZIndex(cy);
  }, [hoveredConnectionId, selectedConnectionId, edgeStructureKey]);

  /** 有“选中对象”时：把未高亮的点/边整体再 dim 50%（在各自基础透明度上 *0.5） */
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const hasSelection = !!focusedNodeId || !!selectedConnectionId;
    const keepSel =
      'node.focus-core, node.focus-nh, node.focus-hover, node.focus-edge-endpoint, node:selected,' +
      'edge.focus-e, edge.focus-edge-hover, edge.focus-edge-selected, edge:selected';
    cy.batch(() => {
      cy.elements().removeClass('graph-dim');
      if (!hasSelection) return;
      const keep = cy.elements(keepSel);
      cy.elements().not(keep).addClass('graph-dim');
    });
  }, [focusedNodeId, selectedConnectionId, hoveredConnectionId, hoveredNote?.id, edgeStructureKey, nodeStructureKey, relatedHighlightKeysSig]);

  /** 时间线布局下：图层面板权重或牵引强度变更时重跑时间线 preset */
  useEffect(() => {
    if (activeGraphLayout !== 'time') return;
    const cy = cyRef.current;
    if (!cy) return;
    const valid = cy.nodes().filter((n) => n.data('timeSort') != null);
    if (valid.length === 0) return;
    applyGraphTimeLayout(cy, () => {}, timeLayoutOpts, mergedFrameGraphLayers, 'frame');
  }, [activeGraphLayout, timeLayoutOpts, graphLayersOrderKey, graphLayersHiddenKey, mergedFrameGraphLayers]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    applyGraphDualLayerNodeVisibility(
      cy,
      mergedTagGraphLayers.hidden,
      mergedFrameGraphLayers.hidden,
      mergedTagGraphLayers.tagVisibilityLogic ?? 'or'
    );
  }, [
    activeGraphLayout,
    mergedTagGraphLayers.hidden,
    mergedTagGraphLayers.tagVisibilityLogic,
    mergedFrameGraphLayers.hidden,
    tagGraphLayersHiddenKey,
    frameGraphLayersHiddenKey,
    nodeStructureKey,
    notesLayerVisualKey,
    focusedNodeId,
    relatedHighlightKeysSig
  ]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onLeave = () => setHoveredNote(null);
    el.addEventListener('mouseleave', onLeave);
    return () => el.removeEventListener('mouseleave', onLeave);
  }, []);

  const applyCoseLayout = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    // applyGraphLayout 内会清簇装饰并以增量 fcose 从当前位置动画导向
    applyGraphLayout(cy, 'fcose');
    setActiveGraphLayout('cose');
    persistGraphLayout('cose');
  }, [persistGraphLayout]);

  const applyTimeLayout = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    applyGraphTimeLayout(cy, undefined, timeLayoutOpts, mergedFrameGraphLayers, 'frame');
    const valid = cy.nodes().filter((n) => n.data('timeSort') != null);
    if (valid.length > 0) {
      setActiveGraphLayout('time');
      persistGraphLayout('time');
    }
  }, [persistGraphLayout, timeLayoutOpts, mergedFrameGraphLayers]);

  const saveEdgeLabel = useCallback(() => {
    if (!selectedConn || !onUpdateConnections) return;
    const next = connections.map((c) =>
      c.id === selectedConn.id ? { ...c, label: edgeLabelDraft } : c
    );
    onUpdateConnections(next);
  }, [selectedConn, edgeLabelDraft, connections, onUpdateConnections]);

  const exportStandaloneHtml = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const payload = buildGraphExportPayload(project, themeColor, cy, {
      chromeOpacity: mapUiChromeOpacity,
      chromeBlurPx: mapUiChromeBlurPx,
      chainLength
    });
    const html = buildStandaloneGraphHtml(payload);
    const safe = (project.name || 'graph').replace(/[/\\\\?%*:|"<>]/g, '_');
    downloadTextFile(`${safe}-graph-demo.html`, html, 'text/html;charset=utf-8');
  }, [project, themeColor, mapUiChromeOpacity, mapUiChromeBlurPx, chainLength]);

  const exportJson = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const payload = buildGraphExportPayload(project, themeColor, cy, {
      chromeOpacity: mapUiChromeOpacity,
      chromeBlurPx: mapUiChromeBlurPx,
      chainLength
    });
    const safe = (project.name || 'graph').replace(/[/\\\\?%*:|"<>]/g, '_');
    downloadGraphPayloadJson(payload, safe);
  }, [project, themeColor, mapUiChromeOpacity, mapUiChromeBlurPx, chainLength]);

  const exportMappViz = useCallback(() => {
    if (!(project.notes || []).length) {
      window.alert('该项目没有便签可导出');
      return;
    }
    downloadMappVizJson(project);
  }, [project]);

  const graphDownloadItems = useMemo(
    () => [
      { id: 'html', label: '导出独立演示网页', onSelect: () => exportStandaloneHtml() },
      { id: 'json', label: '导出 JSON 数据', onSelect: () => exportJson() },
      { id: 'viz', label: '导出 Bibliometrics (.viz.json)', onSelect: () => exportMappViz() }
    ],
    [exportStandaloneHtml, exportJson, exportMappViz]
  );

  useEffect(() => {
    if (!isUIVisible) return;
    let raf: number | null = null;
    const GAP = 12;
    const measure = () => {
      raf = null;
      let bottom = 0;
      const host = graphTopLeftChromeRef.current;
      if (host) {
        bottom = Math.max(bottom, host.getBoundingClientRect().bottom);
      }
      document.querySelectorAll('[data-graph-top-left-panel]').forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        const r = node.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return;
        bottom = Math.max(bottom, r.bottom);
      });
      // 无工具栏时仍至少留出「按钮行」下方空隙的近似值
      const minTop = window.matchMedia('(min-width: 640px)').matches ? 16 + 48 + GAP : 8 + 40 + GAP;
      setPreviewOffsetTopPx(Math.max(minTop, Math.round(bottom + GAP)));
    };
    const schedule = () => {
      if (raf != null) return;
      raf = requestAnimationFrame(measure);
    };
    schedule();
    const t = window.setTimeout(schedule, 50);
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    const host = graphTopLeftChromeRef.current;
    if (host && ro) ro.observe(host);
    document.querySelectorAll('[data-graph-top-left-panel]').forEach((node) => {
      if (node instanceof HTMLElement && ro) ro.observe(node);
    });
    window.addEventListener('resize', schedule);
    return () => {
      if (raf != null) cancelAnimationFrame(raf);
      window.clearTimeout(t);
      ro?.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [isUIVisible, showTagLayerPanel, showFrameLayerPanel, showSettingsPanel, isGraphToolbarEditMode]);

  useEffect(() => {
    if (!isUIVisible) onWorkspaceEditModeChange(false);
  }, [isUIVisible, onWorkspaceEditModeChange]);

  useEffect(() => {
    setPreviewImageIndex(0);
  }, [previewNote?.id]);

  /** 从 Table 等外部「定位到图谱」 */
  useEffect(() => {
    if (!navigateToGraphNoteId) return;
    focusNoteOnGraphFromPanel(navigateToGraphNoteId);
    onClearGraphNavigation?.();
  }, [navigateToGraphNoteId, focusNoteOnGraphFromPanel, onClearGraphNavigation]);

  /** 打开 NoteEditor 与视图编辑模式无关；单击选中会抑制，双击 / 详情铅笔 / 属性面板解除抑制 */
  const graphEditorOpen =
    isUIVisible &&
    !!focusedNodeId &&
    !selectedConn &&
    !noteEditorSuppressedForGraphConnection;
  useEffect(() => {
    onToggleEditor?.(graphEditorOpen);
  }, [graphEditorOpen, onToggleEditor]);

  /** 标签网格（Tab）禁止拖节点；其余布局在浏览/编辑模式下均可拖动微调位置 */
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const allowNodeDrag = true;
    cy.autoungrabify(!allowNodeDrag);
  }, [activeGraphLayout, graphCyEpoch]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const stopRunningDragForce = () => {
      try {
        dragForceLayoutRef.current?.stop?.();
      } catch {
        // 防御：某些布局实例可能已结束，忽略停止异常
      }
      dragForceLayoutRef.current = null;
    };

    const runDragForceStep = (opts?: { animate?: boolean; numIter?: number }) => {
      stopRunningDragForce();
      const animate = opts?.animate ?? false;
      const numIter = opts?.numIter ?? 160;
      try {
        dragForceLayoutRef.current = cy.layout(buildGraphCoseLayoutOptions(cy, {
          name: 'fcose',
          randomize: false,
          animate,
          fit: false,
          // fCoSE：incremental + randomize:false 需 quality:proof
          quality: 'proof',
          numIter,
          nodeDimensionsIncludeLabels: true
        }, {
          enableCrossingPostProcess: false,
          enableLeftFlowPostProcess: false
        }) as any);
      } catch {
        dragForceLayoutRef.current = cy.layout({
          name: 'fcose',
          randomize: false,
          animate,
          fit: false,
          padding: 40,
          quality: 'proof',
          numIter,
          nodeDimensionsIncludeLabels: true
        } as any);
      }
      try {
        (dragForceLayoutRef.current as any)?.run?.();
      } catch {
        // 防御：cose 在少数数据状态下可能抛 RangeError，降级为不触发本次重排。
        stopRunningDragForce();
      }
    };

    const pullNeighborNodesOnDrag = (center: NodeSingular, dx: number, dy: number) => {
      const d2 = dx * dx + dy * dy;
      if (d2 < 1e-4) return;
      const tagWeights = mergedTagGraphLayers.weights ?? {};
      const getNodeTagWeight = (node: NodeSingular): number => {
        const key = String(node.data('tagGroup') ?? '').trim();
        const raw = key ? Number(tagWeights[key] ?? 0.5) : 0.5;
        return Math.max(0.1, Math.min(1, Number.isFinite(raw) ? raw : 0.5));
      };
      const centerTagWeight = getNodeTagWeight(center);

      const firstHop = new Map<string, { node: NodeSingular; factor: number }>();
      center.connectedEdges().forEach((e) => {
        const other = e.source().id() === center.id() ? e.target() : e.source();
        if (other.empty() || !other.isNode()) return;
        if (other.id() === center.id()) return;
        if (other.grabbed()) return;
        if (other.hasClass('frame-cluster-label') || other.hasClass('frame-cluster-halo')) return;
        if (other.style('display') === 'none') return;
        const rawW = Number(e.data('edgeWeight'));
        const safeW = Number.isFinite(rawW) ? Math.max(0.1, Math.min(4.5, rawW)) : 0.3;
        const normW = (safeW - 0.1) / 4.4;
        const otherTagWeight = getNodeTagWeight(other);
        // tag 权重越大，牵引越强：将两端 tag 权重映射为 0.75~1.55 的额外增益。
        const tagBoost = 0.75 + (((centerTagWeight + otherTagWeight) / 2 - 0.1) / 0.9) * 0.8;
        const factor = (0.2 + normW * 0.32) * tagBoost; // 一阶牵动：明显可见
        const prev = firstHop.get(other.id());
        if (!prev || factor > prev.factor) firstHop.set(other.id(), { node: other, factor });
      });
      if (firstHop.size === 0) return;

      const secondHop = new Map<string, { node: NodeSingular; factor: number }>();
      firstHop.forEach(({ node: n1, factor: f1 }) => {
        n1.connectedEdges().forEach((e) => {
          const n2 = e.source().id() === n1.id() ? e.target() : e.source();
          if (n2.empty() || !n2.isNode()) return;
          if (n2.id() === center.id() || n2.id() === n1.id()) return;
          if (firstHop.has(n2.id())) return;
          if (n2.grabbed()) return;
          if (n2.hasClass('frame-cluster-label') || n2.hasClass('frame-cluster-halo')) return;
          if (n2.style('display') === 'none') return;
          const rawW = Number(e.data('edgeWeight'));
          const safeW = Number.isFinite(rawW) ? Math.max(0.1, Math.min(4.5, rawW)) : 0.3;
          const normW = (safeW - 0.1) / 4.4;
          const n2TagWeight = getNodeTagWeight(n2);
          const tagBoost = 0.75 + (((centerTagWeight + n2TagWeight) / 2 - 0.1) / 0.9) * 0.8;
          const factor = (0.08 + normW * 0.14) * f1 * 0.55 * tagBoost; // 二阶轻微衰减，避免全图抖动
          const prev = secondHop.get(n2.id());
          if (!prev || factor > prev.factor) secondHop.set(n2.id(), { node: n2, factor });
        });
      });

      cy.batch(() => {
        firstHop.forEach(({ node, factor }) => {
          const p = node.position();
          node.position({ x: p.x + dx * factor, y: p.y + dy * factor });
        });
        secondHop.forEach(({ node, factor }) => {
          const p = node.position();
          node.position({ x: p.x + dx * factor, y: p.y + dy * factor });
        });
      });
    };

    if (!(isGraphToolbarEditMode && activeGraphLayout === 'cose')) {
      stopRunningDragForce();
      dragForceNodeIdRef.current = null;
      return;
    }

    const onGrab = (evt: cytoscape.EventObject) => {
      const n = evt.target as NodeSingular;
      if (n.hasClass('frame-cluster-label') || n.hasClass('frame-cluster-halo')) return;
      dragForceNodeIdRef.current = n.id();
      dragLastPosRef.current = { x: n.position('x'), y: n.position('y') };
    };

    const onDrag = (evt: cytoscape.EventObject) => {
      const n = evt.target as NodeSingular;
      if (dragForceNodeIdRef.current !== n.id()) return;
      const nowPos = { x: n.position('x'), y: n.position('y') };
      if (dragLastPosRef.current) {
        pullNeighborNodesOnDrag(
          n,
          nowPos.x - dragLastPosRef.current.x,
          nowPos.y - dragLastPosRef.current.y
        );
      }
      dragLastPosRef.current = nowPos;
    };

    const onFree = (evt: cytoscape.EventObject) => {
      const n = evt.target as NodeSingular;
      if (dragForceNodeIdRef.current !== n.id()) return;
      dragForceNodeIdRef.current = null;
      dragLastPosRef.current = null;
      // 松手后做一次全局回弹，形成“牵一点而动全身”。
      runDragForceStep({ animate: true, numIter: 360 });
    };

    cy.on('grab', 'node', onGrab);
    cy.on('drag', 'node', onDrag);
    cy.on('free', 'node', onFree);

    return () => {
      cy.removeListener('grab', 'node', onGrab);
      cy.removeListener('drag', 'node', onDrag);
      cy.removeListener('free', 'node', onFree);
      stopRunningDragForce();
      dragForceNodeIdRef.current = null;
      dragLastPosRef.current = null;
    };
  }, [isGraphToolbarEditMode, activeGraphLayout, tagGraphLayersWeightsKey]);

  useEffect(() => {
    return () => {
      onToggleEditor?.(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在离开图谱视图时复位 App 的 isEditorOpen
  }, []);

  const editorInitialNote = useMemo(() => {
    if (!focusedNodeId) return undefined;
    return notes.find((n) => n.id === focusedNodeId);
  }, [notes, focusedNodeId]);

  return (
    <div
      id="graph-view-container"
      className="relative flex h-full min-h-0 w-full flex-col bg-gray-50 overflow-hidden"
    >
      {/* 用 flex-1 参与文档流高度，避免仅 absolute 子节点导致父级高度塌成 0（导出页用 100vh 无此问题） */}
      <div
        ref={graphStageRef}
        className="relative min-h-0 min-w-0 flex-1 w-full"
        style={{ backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', backgroundSize: '20px 20px' }}
      >
        {/* cy 容器保持文档流高度（flex-1 祖先），避免 absolute 在部分布局下量到 0 */}
        <div ref={containerRef} className="h-full w-full min-h-0 min-w-0" />
        <GraphHighlightChromeLabels
          cyRef={cyRef}
          hostRef={graphStageRef}
          chromeOpacity={mapUiChromeOpacity}
          chromeBlurPx={mapUiChromeBlurPx}
          themeColor={themeColor}
          nodeSize={graphStylesheetSizing.nodeSize}
          labelFontPx={graphStylesheetSizing.labelFontPx}
          highlightKey={`${graphCyEpoch}\u0001${focusedNodeId ?? ''}\u0001${hoveredNote?.id ?? ''}\u0001${selectedConnectionId ?? ''}\u0001${hoveredConnectionId ?? ''}\u0001${chainLength}\u0001${relatedHighlightKeysSig}\u0001${graphStylesheetSizing.labelFontPx}\u0001${nodeStructureKey}\u0001${tagGraphLayersHiddenKey}\u0001${frameGraphLayersHiddenKey}\u0001${notesLayerVisualKey}\u0001${mergedTagGraphLayers.tagVisibilityLogic ?? 'or'}`}
        />
      </div>

      {nodeColorLegendItems.length > 0 ? (
        <div
          className="absolute bottom-4 left-4 z-[44] pointer-events-none select-none origin-bottom-left transform scale-200"
          aria-hidden
        >
          <div className="flex flex-col gap-1.5">
            {nodeColorLegendItems.slice(0, 8).map((item) => {
              const swatch = Math.max(6, Math.round(legendLabelFontPx * 0.9));
              return (
              <div key={item.key} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  {item.colors.slice(0, 3).map((c) => (
                    <span
                      key={`${item.key}:${c}`}
                      className="inline-block rounded-full border border-white/90 shadow-sm shrink-0"
                      style={{ backgroundColor: c, width: swatch, height: swatch }}
                    />
                  ))}
                </div>
                <span
                  className="text-gray-500 font-medium truncate"
                  style={{ fontSize: legendLabelFontPx }}
                >
                  {item.label}
                </span>
              </div>
              );
            })}
            {nodeColorLegendItems.length > 8 ? (
              <div className="text-gray-500 mt-1" style={{ fontSize: Math.max(8, legendLabelFontPx - 1) }}>
                …共 {nodeColorLegendItems.length} 类
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <GraphTopLeftToolbar
        isUIVisible={isUIVisible}
        themeColor={themeColor}
        chromeSurfaceStyle={ch}
        chromeHoverBackground={chHover}
        setShowSettingsPanel={setShowSettingsPanel}
        showSettingsPanel={showSettingsPanel}
        settingsButtonRef={settingsButtonRef}
        showTagLayerPanel={showTagLayerPanel}
        setShowTagLayerPanel={setShowTagLayerPanel}
        showFrameLayerPanel={showFrameLayerPanel}
        setShowFrameLayerPanel={setShowFrameLayerPanel}
        canShowLayer={!!onUpdateProject}
        panelChromeStyle={panelChromeStyle}
        mergedTagLayers={mergedTagGraphLayers}
        mergedFrameLayers={mergedFrameGraphLayers}
        onTagLayersChange={handleTagLayersChange}
        onFrameLayersChange={handleFrameLayersChange}
        notes={notes}
        onUpdateNote={onUpdateNote}
        onBatchUpdateNotes={handleBatchUpdateNotes}
        frames={project.frames ?? []}
        onUpdateFrame={handleUpdateFrame}
        projectId={projectId}
        onActivateNoteFromLayer={(n) => focusNoteOnGraphFromPanel(n.id)}
        chromeHostRef={graphTopLeftChromeRef}
      />

      <GraphTopCenterConnectionButton
        visible={isUIVisible && isGraphToolbarEditMode && !!onUpdateConnections}
        chromeSurfaceStyle={ch}
        chromeHoverBackground={chHover}
        showConnectionPanel={showConnectionPanel}
        onToggleConnectionPanel={toggleConnectionPanel}
      />

      <GraphTopRightToolbar
        isUIVisible={isUIVisible}
        themeColor={themeColor}
        chromeSurfaceStyle={ch}
        chromeHoverBackground={chHover}
        graphDownloadItems={graphDownloadItems}
        isGraphToolbarEditMode={isGraphToolbarEditMode}
        setIsGraphToolbarEditMode={onWorkspaceEditModeChange}
        notes={notes}
        cyRef={cyRef}
        onLocateNote={focusNoteOnGraphFromPanel}
        graphCyKey={nodeStructureKey}
        reserveRightForInspector={isGraphToolbarEditMode}
      />

      <GraphLayoutModeBar
        panelChromeStyle={panelChromeStyle}
        themeColor={themeColor}
        activeGraphLayout={activeGraphLayout}
        onApplyTimeLayout={applyTimeLayout}
        onApplyCoseLayout={applyCoseLayout}
      />

      {previewNote && !selectedConn && !isGraphToolbarEditMode && !graphEditorOpen && (
        <div
          className="fixed ui-workspace-left z-[1000] flex flex-col gap-3 pointer-events-none"
          style={{
            top: previewOffsetTopPx,
            maxHeight: `calc(100dvh - ${previewOffsetTopPx}px - 1rem)`
          }}
        >
          <NotePreviewCard
            note={previewNote}
            currentImageIndex={previewImageIndex}
            onImageIndexChange={setPreviewImageIndex}
            chromeSurfaceStyle={panelChromeStyle}
            passThrough={Boolean(hoveredNote && hoveredNote.id !== focusedNodeId)}
            embedded
            themeColor={themeColor}
            onOpenEditor={isUIVisible ? openPreviewNoteEditor : undefined}
          />
          {focusedNote ? (
            <GraphRelatedHighlightPanel
              groups={relatedEdgeLabelGroups}
              selectedKeys={relatedHighlightLabelKeys}
              onToggleKey={toggleRelatedLabelKey}
              onToggleColumn={toggleRelatedColumn}
              onSelectAll={selectAllRelatedLabels}
              onClearAll={clearAllRelatedLabels}
              themeColor={themeColor}
              chromeSurfaceStyle={panelChromeStyle}
              embedded
            />
          ) : null}
        </div>
      )}

      {graphEditorOpen && editorInitialNote && (
        <NoteEditor
          isOpen
          onClose={closeGraphNoteEditor}
          initialNote={editorInitialNote}
          onSave={(updated) => {
            if (!updated.id) return;
            const existingNote = notes.find((n) => n.id === updated.id);
            if (!existingNote) return;
            const fullNote: Note = {
              ...existingNote,
              ...updated,
              variant: updated.variant || existingNote.variant,
              isFavorite: updated.isFavorite ?? existingNote.isFavorite ?? false,
              images: updated.images !== undefined ? updated.images : (existingNote.images || []),
              sketch: 'sketch' in updated ? updated.sketch : existingNote.sketch
            };
            onUpdateNote(fullNote);
          }}
          onDelete={onDeleteNote}
          onSwitchToMapView={undefined}
          onSwitchToBoardView={
            onSwitchToBoardView
              ? (coords) => {
                  closeGraphNoteEditor();
                  onSwitchToBoardView(coords);
                }
              : undefined
          }
          onSwitchToGraphView={(noteId) => {
            closeGraphNoteEditor();
            focusNoteOnGraphFromPanel(noteId);
          }}
          themeColor={themeColor}
          panelChromeStyle={panelChromeStyle}
        />
      )}

      {showConnectionPanel && isGraphToolbarEditMode && onUpdateConnections && isUIVisible && (
        <GraphConnectionPanel
          isOpen
          themeColor={themeColor}
          panelChromeStyle={panelChromeStyle}
          notes={notes}
          draft={connectionDraft}
          onDraftChange={(patch) => setConnectionDraft((d) => ({ ...d, ...patch }))}
          panelEditingKey={panelEditingKey}
          pickTarget={pickTarget}
          onPickTargetChange={setPickTarget}
          onCommit={commitConnectionDraft}
          onDelete={handleDeleteConnection}
          onNewConnection={handleNewConnection}
          onBeginEndpointEdit={handleNewConnection}
          graphPickNonce={graphPickNonce}
          onClearGraphAndDraftSelection={clearConnectionGraphAndDraft}
          onClearFromSelection={clearConnectionFromOnly}
          onClearToSelection={clearConnectionToOnly}
          showClearSelection={
            !!selectedConnectionId ||
            !!focusedNodeId ||
            !!connectionDraft.fromNoteId ||
            !!connectionDraft.toNoteId ||
            !!pickTarget
          }
          onFocusNoteOnGraph={focusNoteOnGraphFromPanel}
          graphFocusedNoteId={focusedNodeId}
          onAddEndpointFromGraph={addEndpointFromFocusedGraphNode}
          saveSuccessNonce={connectionSaveSuccessNonce}
          commitDisabled={connectionPanelSaveResetting}
          onClose={() => {
            if (connectionSaveResetTimerRef.current) {
              clearTimeout(connectionSaveResetTimerRef.current);
              connectionSaveResetTimerRef.current = null;
            }
            connectionPanelCommitCooldownRef.current = false;
            setConnectionPanelSaveResetting(false);
            setShowConnectionPanel(false);
            setPickTarget(null);
          }}
        />
      )}

      {isUIVisible && isGraphToolbarEditMode && (
        <EditInspectorPanel
          note={focusedNote}
          inspectorConnection={focusedNote ? null : selectedConn}
          groupContext={null}
          coordMode="graph"
          themeColor={themeColor}
          panelChromeStyle={panelChromeStyle}
          frames={project.frames ?? []}
          connections={connections}
          notes={notes}
          hasConnectionWrite={!!onUpdateConnections}
          onUpdateNote={onUpdateNote}
          onOpenFullNoteEditor={openInspectorNoteEditor}
          onEditConnection={handleInspectorEditConnection}
          onNewConnection={handleInspectorNewConnection}
          onFocusPeerInView={focusNoteOnGraphFromPanel}
          onUpdateFrames={onUpdateProject ? handleUpdateFrames : undefined}
        />
      )}

      <SettingsPanel
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        anchorRef={settingsButtonRef}
        settingsContextView="graph"
        themeColor={themeColor}
        onThemeColorChange={onThemeColorChange ?? (() => {})}
        mapUiChromeOpacity={mapUiChromeOpacity}
        onMapUiChromeOpacityChange={onMapUiChromeOpacityChange ?? (() => {})}
        mapUiChromeBlurPx={mapUiChromeBlurPx}
        onMapUiChromeBlurPxChange={onMapUiChromeBlurPxChange ?? (() => {})}
        currentMapStyle={mapStyleId}
        onMapStyleChange={onMapStyleChange ?? (() => {})}
        graphProject={project}
        onGraphProjectPatch={
          onUpdateProject ? (patch) => void onUpdateProject(projectId, patch) : undefined
        }
      />
    </div>
  );
};
