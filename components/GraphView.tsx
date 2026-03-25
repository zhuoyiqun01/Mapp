import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type cytoscape from 'cytoscape';
import { Core, EdgeSingular, NodeSingular } from 'cytoscape';
import { NotePreviewCard } from './map/overlays/NotePreviewCard';
import { NoteEditor } from './NoteEditor';
import { SettingsPanel } from './SettingsPanel';
import type { Connection, GraphLayerState, Note, Project } from '../types';
import { DEFAULT_THEME_COLOR } from '../constants';
import {
  buildGraphElements,
  buildGraphExportPayload,
  DEFAULT_GRAPH_STYLESHEET_SIZING,
  getGraphStylesheet,
  graphNodeStructureKey
} from '../utils/graph/graphData';
import { buildStandaloneGraphHtml, downloadTextFile } from '../utils/graph/graphExportHtml';
import { attachBoardlikeWheelZoom, createAppGraphCy } from '../utils/graph/graphRuntime';
import {
  applyGraphCircleLayout,
  applyGraphLayout,
  applyGraphLayoutMode,
  applyGraphTagGridLayout,
  applyGraphTimeLayout,
  DEFAULT_GRAPH_LAYOUT_MODE,
  type GraphLayoutMode,
  type GraphTimeLayoutOptions,
  applyGraphHoverHighlight,
  applyGraphNeighborHighlight,
  attachGraphResizeObserver,
  downloadGraphPayloadJson,
  mergeGraphLayerState,
  patchGraphElementsData,
  scheduleGraphResizeAndFit,
  updateGraphStylesheet,
  animateGraphCenterOnNode,
  applyGraphLayerNodeVisibility,
  applyGraphFrameClusterMembersLayout,
  applyGraphFrameClusterPeekHighlight,
  type GraphLayerGroupStandard
} from '../utils/graph/graphRuntimeCore';
import { mapChromeHaloFillAndBorder } from '../utils/map/mapChromeStyle';
import { getGraphLayoutCache, setGraphLayoutCache } from '../utils/persistence/storage';
import { GraphConnectionPanel, type ConnectionDraft } from './graph/GraphConnectionPanel';
import { GraphTopLeftToolbar } from './graph/GraphTopLeftToolbar';
import { GraphTopCenterConnectionButton } from './graph/GraphTopCenterConnectionButton';
import { GraphTopRightToolbar } from './graph/GraphTopRightToolbar';
import { GraphLayoutModeBar } from './graph/GraphLayoutModeBar';
import { generateId } from '../utils';

/** 与 `connectionToGraphDirection` 一致：从存储的 Connection 还原面板上的起终点箭头选项 */
function connectionToPanelDraft(c: Connection): ConnectionDraft {
  const fromArrow: 'arrow' | 'none' =
    c.fromArrow != null ? c.fromArrow : c.arrow === 'reverse' ? 'arrow' : 'none';
  const toArrow: 'arrow' | 'none' =
    c.toArrow != null ? c.toArrow : c.arrow === 'forward' ? 'arrow' : 'none';
  return {
    fromNoteId: c.fromNoteId,
    toNoteId: c.toNoteId,
    label: c.label || '',
    fromArrow,
    toArrow
  };
}

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
  panelChromeStyle,
  chromeHoverBackground,
  onThemeColorChange,
  mapUiChromeOpacity = 0.9,
  onMapUiChromeOpacityChange,
  mapUiChromeBlurPx = 8,
  onMapUiChromeBlurPxChange,
  mapStyleId = 'carto-light-nolabels',
  onMapStyleChange,
  onUpdateProject
}) => {
  const ch = panelChromeStyle;
  const chHover = chromeHoverBackground;
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [isGraphToolbarEditMode, setIsGraphToolbarEditMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const unbindRef = useRef<(() => void) | null>(null);
  const noteByIdRef = useRef<Map<string, Note>>(new Map());
  const connectionsRef = useRef<Connection[]>([]);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [hoveredNote, setHoveredNote] = useState<Note | null>(null);
  const [chainLength, setChainLength] = useState<number>(1);
  const chainLengthRef = useRef<number>(1);
  chainLengthRef.current = chainLength;
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
    return project.graphDefaultLayoutMode ?? DEFAULT_GRAPH_LAYOUT_MODE;
  });

  /** frameCluster：点击簇标题「临时只看」选中的帧 id（空串表示「无帧」簇）；逻辑与看板 frame 标题过滤一致 */
  const [frameClusterPeekFrameIds, setFrameClusterPeekFrameIds] = useState<Set<string>>(() => new Set());
  const frameClusterPeekKey = useMemo(
    () => Array.from(frameClusterPeekFrameIds).sort().join('\u0001'),
    [frameClusterPeekFrameIds]
  );

  const activeGraphLayoutRef = useRef(activeGraphLayout);
  activeGraphLayoutRef.current = activeGraphLayout;
  const frameClusterPeekFrameIdsRef = useRef(frameClusterPeekFrameIds);
  frameClusterPeekFrameIdsRef.current = frameClusterPeekFrameIds;

  /** cytoscape 回调闭包不随 render 更新，用 ref 读连线面板 + 点选模式 */
  const graphUiRef = useRef({
    showConnectionPanel: false,
    pickTarget: null as 'from' | 'to' | null,
    isGraphToolbarEditMode: false
  });
  graphUiRef.current = { showConnectionPanel, pickTarget, isGraphToolbarEditMode };

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
    return {
      nodeSize: Math.min(36, Math.max(4, nodeSize)),
      labelFontPx: Math.min(16, Math.max(4, labelFontPx)),
      edgeWeight: Math.min(4, Math.max(0.1, Math.round(edgeWeight * 10) / 10))
    };
  }, [project.graphNodeSize, project.graphLabelFontPx, project.graphEdgeWeight]);

  const handleQuickGraphStyleChange = useCallback(
    (patch: { nodeSize?: number; labelSize?: number; edgeWeight?: number }) => {
      if (!onUpdateProject || !projectId) return;
      const nextPatch: Partial<Project> = {};
      if (patch.nodeSize != null) {
        nextPatch.graphNodeSize = Math.round(Math.min(36, Math.max(4, patch.nodeSize)));
      }
      if (patch.labelSize != null) {
        nextPatch.graphLabelFontPx = Math.round(Math.min(16, Math.max(4, patch.labelSize)));
      }
      if (patch.edgeWeight != null) {
        nextPatch.graphEdgeWeight = Math.min(2, Math.max(0.1, Math.round(patch.edgeWeight * 10) / 10));
      }
      if (Object.keys(nextPatch).length > 0) {
        void onUpdateProject(projectId, nextPatch);
      }
    },
    [onUpdateProject, projectId]
  );

  const graphLayerGroupStandard = (project.graphLayerStandard ?? 'tag') as GraphLayerGroupStandard;

  const mergedTagGraphLayers = useMemo(
    () => mergeGraphLayerState(notes, project.graphLayers ?? null, 'tag'),
    [notes, project.graphLayers]
  );

  const mergedFrameGraphLayers = useMemo(
    () => mergeGraphLayerState(notes, project.graphFrameLayers ?? null, 'frame'),
    [notes, project.graphFrameLayers]
  );

  /** 时间轴/环形视图：按当前设置选择对应分组面板 */
  const mergedGraphLayers = graphLayerGroupStandard === 'frame' ? mergedFrameGraphLayers : mergedTagGraphLayers;

  const timeLayoutOpts = useMemo(
    (): GraphTimeLayoutOptions => ({
      weightBias: project.graphTimeAxisWeightBias ?? 0
    }),
    [project.graphTimeAxisWeightBias]
  );

  /** 节点颜色图例：基于「节点实际颜色来源（首个 tag.color / note.color / themeColor）」 */
  const nodeColorLegendItems = useMemo(() => {
    const byTagLabel = new Map<string, Set<string>>();
    for (const note of notes) {
      const t0 = note.tags?.[0];
      if (!t0) continue;
      const label = String(t0.label ?? '').trim();
      if (!label) continue;
      const c = (t0.color ?? note.color ?? themeColor).toString().trim();
      if (!c) continue;
      if (!byTagLabel.has(label)) byTagLabel.set(label, new Set<string>());
      byTagLabel.get(label)!.add(c);
    }

    const keysInOrder = mergedTagGraphLayers.order ?? [];
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const k of keysInOrder) {
      const key = String(k).trim();
      if (byTagLabel.has(key) && !seen.has(key)) {
        ordered.push(key);
        seen.add(key);
      }
    }
    const rest = [...byTagLabel.keys()]
      .filter((k) => !seen.has(k))
      .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
    const keys = [...ordered, ...rest];

    return keys.map((label) => ({
      label,
      colors: [...(byTagLabel.get(label) ?? [])]
    }));
  }, [notes, themeColor, mergedTagGraphLayers.order]);

  const handleGraphLayersChange = useCallback(
    (next: GraphLayerState) => {
      if (!onUpdateProject || !projectId) return;
      if (graphLayerGroupStandard === 'frame') {
        void onUpdateProject(projectId, { graphFrameLayers: next });
      } else {
        void onUpdateProject(projectId, { graphLayers: next });
      }
    },
    [onUpdateProject, projectId, graphLayerGroupStandard]
  );

  const handleGraphLayerGroupStandardChange = useCallback(
    (standard: GraphLayerGroupStandard) => {
      if (!onUpdateProject || !projectId) return;
      void onUpdateProject(projectId, { graphLayerStandard: standard });
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

  /** 与项目 `graphCircleRefineOrderWithForce` 一致；未设置时默认开启 */
  const circleRefineWithForce = project.graphCircleRefineOrderWithForce !== false;
  const circleRefineLayoutCommittedRef = useRef<boolean | null>(null);

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
      setActiveGraphLayout(project.graphDefaultLayoutMode ?? DEFAULT_GRAPH_LAYOUT_MODE);
      return;
    }
    setActiveGraphLayout(
      getGraphLayoutCache(projectId) ?? project.graphDefaultLayoutMode ?? DEFAULT_GRAPH_LAYOUT_MODE
    );
  }, [projectId, project.graphDefaultLayoutMode]);

  useEffect(() => {
    if (activeGraphLayout !== 'frameCluster') {
      setFrameClusterPeekFrameIds(new Set());
    }
  }, [activeGraphLayout]);

  const nodeStructureKey = useMemo(() => graphNodeStructureKey(notes), [notes]);
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
      applyGraphNeighborHighlight(cy, null, chainLengthRef.current);
    }
  }, []);

  /** 关闭节点编辑器但保留 hover（用于 NoteEditor 关闭/保存后） */
  const closeGraphNoteEditor = useCallback(() => {
    const cy = cyRef.current;
    setFocusedNodeId(null);
    setNoteEditorSuppressedForGraphConnection(false);
    if (cy) {
      cy.elements().unselect();
      applyGraphNeighborHighlight(cy, null, chainLengthRef.current);
    }
    onToggleEditor?.(false);
  }, [onToggleEditor]);

  const focusedNote = useMemo(
    () => (focusedNodeId ? noteById.get(focusedNodeId) ?? null : null),
    [focusedNodeId, noteById]
  );

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
      applyGraphNeighborHighlight(cy, null, chainLengthRef.current);
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
  }, [emptyConnectionDraft]);

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
      applyGraphNeighborHighlight(cy, null, chainLengthRef.current);
    }
    setPanelEditingKey('new');
    setConnectionDraft((d) => ({ ...d, fromNoteId: '' }));
  }, []);

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
      applyGraphNeighborHighlight(cy, null, chainLengthRef.current);
    }
    setPanelEditingKey('new');
    setConnectionDraft((d) => ({ ...d, toNoteId: '' }));
  }, []);

  /** 关联面板内点击已选便签标题：图中定位并高亮，不打开便签编辑器 */
  const focusNoteOnGraphFromPanel = useCallback((noteId: string) => {
    const cy = cyRef.current;
    setFocusedNodeId(noteId);
    setNoteEditorSuppressedForGraphConnection(true);
    if (cy) {
      applyGraphNeighborHighlight(cy, noteId, chainLengthRef.current);
      requestAnimationFrame(() => animateGraphCenterOnNode(cy, noteId));
    }
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
      applyGraphNeighborHighlight(cy, noteId, chainLengthRef.current);
      requestAnimationFrame(() => animateGraphCenterOnNode(cy, noteId));
    }
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

        if (activeGraphLayoutRef.current === 'frameCluster' && n.hasClass('frame-cluster-label')) {
          if (graphNodeTapTimerRef.current) {
            clearTimeout(graphNodeTapTimerRef.current);
            graphNodeTapTimerRef.current = null;
          }
          const rawKey = n.data('clusterFrameKey');
          const clusterKey = rawKey !== undefined && rawKey !== null ? String(rawKey) : '';
          const oe = evt.originalEvent;
          const shift = oe instanceof MouseEvent ? oe.shiftKey : false;
          setFrameClusterPeekFrameIds((prev) => {
            const next = new Set(prev);
            if (shift) {
              if (next.has(clusterKey)) next.delete(clusterKey);
              else next.add(clusterKey);
            } else if (next.size === 1 && next.has(clusterKey)) {
              next.clear();
            } else {
              next.clear();
              next.add(clusterKey);
            }
            return next;
          });
          cy.elements().unselect();
          return;
        }

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
          applyGraphNeighborHighlight(cy, id, chainLengthRef.current);
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
        applyGraphNeighborHighlight(cy, id, chainLengthRef.current);
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
        applyGraphNeighborHighlight(cy, null, chainLengthRef.current);
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
        if (activeGraphLayoutRef.current === 'frameCluster' && frameClusterPeekFrameIdsRef.current.size > 0) {
          setFrameClusterPeekFrameIds(new Set());
        }
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
    [clearSelection, emptyConnectionDraft]
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
      elements: buildGraphElements(notes, connections, themeColor, graphStylesheetSizing.edgeWeight),
      style: getGraphStylesheet(themeColor, graphStylesheetSizing)
    });
    const cached = projectId ? getGraphLayoutCache(projectId) : null;
    let initialMode =
      cached ?? project.graphDefaultLayoutMode ?? DEFAULT_GRAPH_LAYOUT_MODE;
    const initGraphLayers = initialMode === 'frameCluster' ? mergedFrameGraphLayers : mergedGraphLayers;
    const initGraphLayerGroupStandard =
      initialMode === 'frameCluster' ? ('frame' as const) : graphLayerGroupStandard;
    applyGraphLayoutMode(cy, initialMode, {
      silentTimeFallback: true,
      timeLayout: timeLayoutOpts,
      circleRefineWithForce,
      graphLayers: initGraphLayers,
      graphLayerGroupStandard: initGraphLayerGroupStandard,
      tagGridGraphLayers: mergedTagGraphLayers,
      frames: project.frames ?? [],
      chromeSurface: { opacity: mapUiChromeOpacity, blurPx: mapUiChromeBlurPx }
    });
    if (initialMode === 'time') {
      const valid = cy.nodes().filter((n) => n.data('timeSort') != null);
      if (valid.length === 0) {
        initialMode = 'tagGrid';
        if (projectId) setGraphLayoutCache(projectId, 'tagGrid');
      }
    }
    setActiveGraphLayout(initialMode);
    cyRef.current = cy;
    unbindRef.current = bindCyEvents(cy);

    const detachWheel = attachBoardlikeWheelZoom(cy);

    const detachRo = attachGraphResizeObserver(cy, el);
    scheduleGraphResizeAndFit(cy);

    return () => {
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
    const elements = buildGraphElements(notes, connections, themeColor, graphStylesheetSizing.edgeWeight);
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

    updateGraphStylesheet(cy, getGraphStylesheet(themeColor, graphStylesheetSizing));
    const haloPaint = mapChromeHaloFillAndBorder(mapUiChromeOpacity, mapUiChromeBlurPx);
    cy.batch(() => {
      cy.nodes('.frame-cluster-halo').forEach((n) => {
        n.data({ haloFill: haloPaint.fill, haloBorder: haloPaint.border });
      });
    });
    patchGraphElementsData(cy, elements);
    applyGraphNeighborHighlight(cy, focusedNodeId, chainLength);
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
    chainLength,
    mapUiChromeOpacity,
    mapUiChromeBlurPx
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
      if (hoveredConnectionId) {
        const e = cy.getElementById(hoveredConnectionId);
        if (!e.empty() && e.isEdge()) e.addClass('focus-edge-hover');
      }
      if (selectedConnectionId) {
        const e = cy.getElementById(selectedConnectionId);
        if (!e.empty() && e.isEdge()) e.addClass('focus-edge-selected');
      }
    });
  }, [hoveredConnectionId, selectedConnectionId, edgeStructureKey]);

  /** 时间线布局下：图层面板权重或牵引强度变更时重跑时间线 preset */
  useEffect(() => {
    if (activeGraphLayout !== 'time') return;
    const cy = cyRef.current;
    if (!cy) return;
    const valid = cy.nodes().filter((n) => n.data('timeSort') != null);
    if (valid.length === 0) return;
    applyGraphTimeLayout(cy, () => {}, timeLayoutOpts, mergedGraphLayers, graphLayerGroupStandard);
  }, [activeGraphLayout, timeLayoutOpts, graphLayersOrderKey, graphLayersHiddenKey, mergedGraphLayers]);

  /** 圆环布局下：仅当用户切换「力传导重排」时重跑圆环（避免与初载布局重复） */
  useEffect(() => {
    if (activeGraphLayout !== 'circle') {
      circleRefineLayoutCommittedRef.current = circleRefineWithForce;
      return;
    }
    const cy = cyRef.current;
    if (!cy) return;
    if (circleRefineLayoutCommittedRef.current === null) {
      circleRefineLayoutCommittedRef.current = circleRefineWithForce;
      return;
    }
    if (circleRefineLayoutCommittedRef.current === circleRefineWithForce) return;
    circleRefineLayoutCommittedRef.current = circleRefineWithForce;
    applyGraphCircleLayout(cy, circleRefineWithForce, mergedGraphLayers, graphLayerGroupStandard);
  }, [activeGraphLayout, circleRefineWithForce, mergedGraphLayers]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (activeGraphLayout === 'time' || activeGraphLayout === 'circle') {
      applyGraphLayerNodeVisibility(cy, mergedGraphLayers.hidden, graphLayerGroupStandard);
      return;
    }
    if (activeGraphLayout === 'frameCluster') {
      applyGraphLayerNodeVisibility(cy, mergedFrameGraphLayers.hidden, 'frame');
      return;
    }
    applyGraphLayerNodeVisibility(cy, mergedTagGraphLayers.hidden, 'tag');
  }, [
    activeGraphLayout,
    graphLayerGroupStandard,
    graphLayersHiddenKey,
    mergedTagGraphLayers.hidden,
    tagGraphLayersHiddenKey,
    frameGraphLayersHiddenKey,
    nodeStructureKey
  ]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (activeGraphLayout === 'tagGrid') {
      applyGraphTagGridLayout(cy, mergedTagGraphLayers);
    } else if (activeGraphLayout === 'circle') {
      applyGraphCircleLayout(cy, circleRefineWithForce, mergedGraphLayers, graphLayerGroupStandard);
    }
  }, [mergedGraphLayers, mergedTagGraphLayers, activeGraphLayout, circleRefineWithForce, graphLayerGroupStandard]);

  /** frameCluster 布局：当帧分层面板（排序/显隐/权重）变化时重算簇中心 + 簇内成员位置 */
  useEffect(() => {
    if (activeGraphLayout !== 'frameCluster') return;
    const cy = cyRef.current;
    if (!cy) return;
    const chrome = mapUiChromeRef.current;
    applyGraphFrameClusterMembersLayout(
      cy,
      mergedFrameGraphLayers,
      project.frames ?? [],
      mergedTagGraphLayers,
      { opacity: chrome.opacity, blurPx: chrome.blurPx }
    );
  }, [
    activeGraphLayout,
    mergedFrameGraphLayers,
    mergedTagGraphLayers,
    project.frames,
    frameGraphLayersHiddenKey,
    frameGraphLayersOrderKey,
    tagGraphLayersOrderKey,
    tagGraphLayersWeightsKey,
    tagGraphLayersHiddenKey
  ]);

  /** frameCluster 布局重算后簇标题节点会重建，需按当前「临时只看」状态重新挂类 */
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (activeGraphLayout !== 'frameCluster') {
      applyGraphFrameClusterPeekHighlight(cy, null);
      return;
    }
    applyGraphFrameClusterPeekHighlight(
      cy,
      frameClusterPeekFrameIds.size > 0 ? frameClusterPeekFrameIds : null
    );
  }, [
    activeGraphLayout,
    frameClusterPeekKey,
    mergedFrameGraphLayers,
    mergedTagGraphLayers,
    project.frames,
    frameGraphLayersHiddenKey,
    frameGraphLayersOrderKey,
    tagGraphLayersOrderKey,
    tagGraphLayersWeightsKey,
    tagGraphLayersHiddenKey,
    nodeStructureKey
  ]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (activeGraphLayout === 'frameCluster') return;
    cy.batch(() => {
      cy.nodes('.frame-cluster-label').remove();
      cy.nodes('.frame-cluster-halo').remove();
    });
  }, [activeGraphLayout]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onLeave = () => setHoveredNote(null);
    el.addEventListener('mouseleave', onLeave);
    return () => el.removeEventListener('mouseleave', onLeave);
  }, []);

  const applyLayout = useCallback(
    (name: 'cose-bilkent' | 'circle') => {
      const cy = cyRef.current;
      if (!cy) return;
      applyGraphLayout(cy, name, circleRefineWithForce, mergedGraphLayers, graphLayerGroupStandard);
      const mode: GraphLayoutMode = name === 'circle' ? 'circle' : 'cose';
      setActiveGraphLayout(mode);
      persistGraphLayout(mode);
    },
    [persistGraphLayout, circleRefineWithForce, mergedGraphLayers, graphLayerGroupStandard]
  );

  const applyTimeLayout = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    applyGraphTimeLayout(cy, undefined, timeLayoutOpts, mergedGraphLayers, graphLayerGroupStandard);
    const valid = cy.nodes().filter((n) => n.data('timeSort') != null);
    if (valid.length > 0) {
      setActiveGraphLayout('time');
      persistGraphLayout('time');
    }
  }, [persistGraphLayout, timeLayoutOpts, mergedGraphLayers, graphLayerGroupStandard]);

  const applyTagGridLayout = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    applyGraphTagGridLayout(cy, mergedTagGraphLayers);
    setActiveGraphLayout('tagGrid');
    persistGraphLayout('tagGrid');
  }, [persistGraphLayout, mergedTagGraphLayers]);

  const applyFrameClusterLayout = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    applyGraphFrameClusterMembersLayout(
      cy,
      mergedFrameGraphLayers,
      project.frames ?? [],
      mergedTagGraphLayers,
      { opacity: mapUiChromeOpacity, blurPx: mapUiChromeBlurPx }
    );
    setActiveGraphLayout('frameCluster');
    persistGraphLayout('frameCluster');
  }, [
    persistGraphLayout,
    mergedFrameGraphLayers,
    mergedTagGraphLayers,
    project.frames,
    mapUiChromeOpacity,
    mapUiChromeBlurPx
  ]);

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
    const payload = buildGraphExportPayload(project, themeColor, cy);
    const html = buildStandaloneGraphHtml(payload);
    const safe = (project.name || 'graph').replace(/[/\\\\?%*:|"<>]/g, '_');
    downloadTextFile(`${safe}-graph-demo.html`, html, 'text/html;charset=utf-8');
  }, [project, themeColor]);

  const exportJson = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const payload = buildGraphExportPayload(project, themeColor, cy);
    const safe = (project.name || 'graph').replace(/[/\\\\?%*:|"<>]/g, '_');
    downloadGraphPayloadJson(payload, safe);
  }, [project, themeColor]);

  const graphDownloadItems = useMemo(
    () => [
      { id: 'html', label: '导出独立演示网页', onSelect: () => exportStandaloneHtml() },
      { id: 'json', label: '导出 JSON 数据', onSelect: () => exportJson() }
    ],
    [exportStandaloneHtml, exportJson]
  );

  useEffect(() => {
    if (!isUIVisible) setIsGraphToolbarEditMode(false);
  }, [isUIVisible]);

  useEffect(() => {
    setPreviewImageIndex(0);
  }, [previewNote?.id]);

  /** 仅编辑模式下双击节点打开 NoteEditor；单击仅选中/预览 */
  const graphEditorOpen =
    isUIVisible &&
    isGraphToolbarEditMode &&
    !!focusedNodeId &&
    !selectedConn &&
    !noteEditorSuppressedForGraphConnection;
  useEffect(() => {
    onToggleEditor?.(graphEditorOpen);
  }, [graphEditorOpen, onToggleEditor]);

  /** 标签网格（Tab）与非编辑模式：禁止拖节点；其余布局在编辑模式下可拖动以微调位置 */
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const allowNodeDrag = isGraphToolbarEditMode && activeGraphLayout !== 'tagGrid';
    cy.autoungrabify(!allowNodeDrag);
  }, [isGraphToolbarEditMode, activeGraphLayout]);

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
        ref={containerRef}
        className="relative min-h-0 min-w-0 flex-1 w-full"
        style={{ backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', backgroundSize: '20px 20px' }}
      />

      {nodeColorLegendItems.length > 0 ? (
        <div
          className="absolute bottom-4 left-4 z-[44] pointer-events-none select-none origin-bottom-left transform scale-200"
          aria-hidden
        >
          <div className="flex flex-col gap-1.5">
            {nodeColorLegendItems.slice(0, 8).map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  {item.colors.slice(0, 3).map((c) => (
                    <span
                      key={`${item.label}:${c}`}
                      className="inline-block w-2.5 h-2.5 rounded-full border border-white/90 shadow-sm"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <span className="text-[11px] text-gray-500 font-medium truncate">{item.label}</span>
              </div>
            ))}
            {nodeColorLegendItems.length > 8 ? (
              <div className="text-[10px] text-gray-500 mt-1">…共 {nodeColorLegendItems.length} 类</div>
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
        showLayerPanel={showLayerPanel}
        setShowLayerPanel={setShowLayerPanel}
        canShowLayer={!!onUpdateProject}
        panelChromeStyle={panelChromeStyle}
        mergedGraphLayers={mergedGraphLayers}
        layerGroupStandard={graphLayerGroupStandard}
        onLayerGroupStandardChange={handleGraphLayerGroupStandardChange}
        onGraphLayersChange={handleGraphLayersChange}
        notes={notes}
        onUpdateNote={onUpdateNote}
        onBatchUpdateNotes={handleBatchUpdateNotes}
        frames={project.frames ?? []}
        isGraphToolbarEditMode={isGraphToolbarEditMode}
        chainLength={chainLength}
        onChainLengthChange={(v) => setChainLength(Math.max(1, Math.min(3, Math.round(v))))}
        quickStyleValues={{
          nodeSize: graphStylesheetSizing.nodeSize,
          labelSize: graphStylesheetSizing.labelFontPx,
          edgeWeight: graphStylesheetSizing.edgeWeight
        }}
        onQuickStyleChange={handleQuickGraphStyleChange}
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
        setIsGraphToolbarEditMode={setIsGraphToolbarEditMode}
        notes={notes}
        cyRef={cyRef}
        onLocateNote={focusNoteOnGraphFromPanel}
        graphCyKey={nodeStructureKey}
      />

      <GraphLayoutModeBar
        panelChromeStyle={panelChromeStyle}
        themeColor={themeColor}
        activeGraphLayout={activeGraphLayout}
        onApplyTagGridLayout={applyTagGridLayout}
        onApplyCircleLayout={() => applyLayout('circle')}
        onApplyTimeLayout={applyTimeLayout}
        onApplyCoseLayout={() => applyLayout('cose-bilkent')}
        onApplyFrameClusterLayout={applyFrameClusterLayout}
      />

      {previewNote && !selectedConn && !isGraphToolbarEditMode && (
        <NotePreviewCard
          note={previewNote}
          currentImageIndex={previewImageIndex}
          onImageIndexChange={setPreviewImageIndex}
          chromeSurfaceStyle={panelChromeStyle}
          passThrough={hoveredNote != null}
        />
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
          onSwitchToMapView={
            onSwitchToMapView
              ? (coords) => {
                  closeGraphNoteEditor();
                  onSwitchToMapView(
                    coords
                      ? {
                          lat: coords.lat,
                          lng: coords.lng,
                          zoom: (coords as { zoom?: number }).zoom ?? 16
                        }
                      : undefined
                  );
                }
              : undefined
          }
          onSwitchToBoardView={
            onSwitchToBoardView
              ? (coords) => {
                  closeGraphNoteEditor();
                  onSwitchToBoardView(coords);
                }
              : undefined
          }
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

      <SettingsPanel
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
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
