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
  graphStructureKey
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
  applyGraphLayerNodeVisibility
} from '../utils/graph/graphRuntimeCore';
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
  const [previewImageIndex, setPreviewImageIndex] = useState(0);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [hoveredConnectionId, setHoveredConnectionId] = useState<string | null>(null);
  const [edgeLabelDraft, setEdgeLabelDraft] = useState('');
  const [showConnectionPanel, setShowConnectionPanel] = useState(false);
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

  const mergedGraphLayers = useMemo(
    () => mergeGraphLayerState(notes, project.graphLayers ?? null),
    [notes, project.graphLayers]
  );

  const timeLayoutOpts = useMemo(
    (): GraphTimeLayoutOptions => ({
      weightBias: project.graphTimeAxisWeightBias ?? 0
    }),
    [project.graphTimeAxisWeightBias]
  );

  const handleGraphLayersChange = useCallback(
    (next: GraphLayerState) => {
      if (!onUpdateProject || !projectId) return;
      void onUpdateProject(projectId, { graphLayers: next });
    },
    [onUpdateProject, projectId]
  );

  const graphLayersHiddenKey = useMemo(
    () => mergedGraphLayers.hidden.slice().sort().join('\u0001'),
    [mergedGraphLayers.hidden]
  );

  const graphLayersOrderKey = useMemo(
    () => (mergedGraphLayers.order ?? []).join('\u0001'),
    [mergedGraphLayers.order]
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

  const structureKey = useMemo(() => graphStructureKey(notes, connections), [notes, connections]);

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

  const toggleConnectionPanel = useCallback(() => {
    setShowConnectionPanel((open) => {
      if (open) setPickTarget(null);
      return !open;
    });
  }, []);

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

  const handleNewConnection = useCallback(() => {
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

  const commitConnectionDraft = useCallback(() => {
    if (!onUpdateConnections) return;
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
    setShowConnectionPanel(false);
    setPickTarget(null);
  }, [onUpdateConnections]);

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
        cy.elements().unselect();
        const n = evt.target as NodeSingular;
        const id = n.id();
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
        cy.elements().unselect();
        clearSelection();
      };

      const onNodeOver = (evt: cytoscape.EventObject) => {
        const n = evt.target as NodeSingular;
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
    applyGraphLayoutMode(cy, initialMode, {
      silentTimeFallback: true,
      timeLayout: timeLayoutOpts,
      circleRefineWithForce,
      graphLayers: mergeGraphLayerState(notes, project.graphLayers ?? null)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅结构变化时重建；便签与主题由下一 effect 同步
  }, [structureKey, bindCyEvents, projectId]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    updateGraphStylesheet(cy, getGraphStylesheet(themeColor, graphStylesheetSizing));
    patchGraphElementsData(
      cy,
      buildGraphElements(notes, connections, themeColor, graphStylesheetSizing.edgeWeight)
    );
    applyGraphNeighborHighlight(cy, focusedNodeId, chainLength);
    applyGraphHoverHighlight(cy, hoveredNote?.id ?? null);
    requestAnimationFrame(() => {
      cy.resize();
    });
  }, [notes, connections, themeColor, focusedNodeId, hoveredNote?.id, graphStylesheetSizing, chainLength]);

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
  }, [hoveredConnectionId, selectedConnectionId, structureKey]);

  /** 时间线布局下：图层面板权重或牵引强度变更时重跑时间线 preset */
  useEffect(() => {
    if (activeGraphLayout !== 'time') return;
    const cy = cyRef.current;
    if (!cy) return;
    const valid = cy.nodes().filter((n) => n.data('timeSort') != null);
    if (valid.length === 0) return;
    applyGraphTimeLayout(cy, () => {}, timeLayoutOpts, mergedGraphLayers);
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
    applyGraphCircleLayout(cy, circleRefineWithForce, mergedGraphLayers);
  }, [activeGraphLayout, circleRefineWithForce, mergedGraphLayers]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    applyGraphLayerNodeVisibility(cy, mergedGraphLayers.hidden);
  }, [graphLayersHiddenKey, structureKey]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (activeGraphLayout === 'tagGrid') {
      applyGraphTagGridLayout(cy, mergedGraphLayers);
    } else if (activeGraphLayout === 'circle') {
      applyGraphCircleLayout(cy, circleRefineWithForce, mergedGraphLayers);
    }
  }, [mergedGraphLayers, activeGraphLayout, circleRefineWithForce]);

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
      applyGraphLayout(cy, name, circleRefineWithForce, mergedGraphLayers);
      const mode: GraphLayoutMode = name === 'circle' ? 'circle' : 'cose';
      setActiveGraphLayout(mode);
      persistGraphLayout(mode);
    },
    [persistGraphLayout, circleRefineWithForce, mergedGraphLayers]
  );

  const applyTimeLayout = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    applyGraphTimeLayout(cy, undefined, timeLayoutOpts, mergedGraphLayers);
    const valid = cy.nodes().filter((n) => n.data('timeSort') != null);
    if (valid.length > 0) {
      setActiveGraphLayout('time');
      persistGraphLayout('time');
    }
  }, [persistGraphLayout, timeLayoutOpts, mergedGraphLayers]);

  const applyTagGridLayout = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    applyGraphTagGridLayout(cy, mergedGraphLayers);
    setActiveGraphLayout('tagGrid');
    persistGraphLayout('tagGrid');
  }, [persistGraphLayout, mergedGraphLayers]);

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
  }, [isGraphToolbarEditMode, activeGraphLayout, structureKey]);

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
        onGraphLayersChange={handleGraphLayersChange}
        notes={notes}
        onUpdateNote={onUpdateNote}
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
      />

      <GraphLayoutModeBar
        panelChromeStyle={panelChromeStyle}
        themeColor={themeColor}
        activeGraphLayout={activeGraphLayout}
        onApplyTagGridLayout={applyTagGridLayout}
        onApplyCircleLayout={() => applyLayout('circle')}
        onApplyTimeLayout={applyTimeLayout}
        onApplyCoseLayout={() => applyLayout('cose-bilkent')}
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
          onClose={() => {
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
