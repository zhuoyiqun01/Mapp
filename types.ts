
export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Tag {
  id: string;
  label: string;
  color: string;
}

export interface Note {
  id: string;
  createdAt: number;
  coords: Coordinates;
  emoji: string;
  text: string;
  fontSize: number; // 1 to 5 scale
  isBold?: boolean;
  isFavorite?: boolean; // 收藏标记
  color?: string; // Background color
  images: string[]; // Image IDs (format: "img-xxx") or Base64 strings (legacy)
  sketch?: string; // Sketch ID (format: "img-xxx") or Base64 string (legacy)
  tags: Tag[];
  
  // 时间段落（精确到年）
  startYear?: number;
  endYear?: number;
  
  // Board View Position
  boardX: number;
  boardY: number;
  isInitialPosition?: boolean; // 是否处于初始自动分配位置（用于重排）
  
  // Type of note（仅 standard 文本便签与 image 图片便签；旧数据中的 compact 在加载时迁移为 standard）
  variant: 'standard' | 'image';
  imageWidth?: number;
  imageHeight?: number;
  
  // Group/Frame membership（一便签只属于一个 Frame；旧多簇取第一个）
  groupId?: string;
  groupName?: string;
  /** 至多一项；与 groupId 同步 */
  groupIds?: string[];
  groupNames?: string[];
  
  // Layout scale for board view
  layoutScale?: number; // Scale factor for layout (default 1)

  // Lightweight note group (not a visual Frame; used for multi-select auto-group)
  noteGroupId?: string;

  /** 全视图共用：在对应分组未隐藏时仍可单独隐藏该节点（与 graphLayers 组隐为 AND） */
  layerItemHidden?: boolean;
  /** 同组内叠放顺序，越大越靠近上层；未设时回退 createdAt */
  layerStackOrder?: number;
}

export interface Connection {
  id: string;
  fromNoteId: string;
  toNoteId: string;
  fromSide: 'top' | 'right' | 'bottom' | 'left';
  toSide: 'top' | 'right' | 'bottom' | 'left';
  arrow?: 'none' | 'forward' | 'reverse'; // 箭头方向：无、正向、反向
  /**
   * 连线标签：挂在整条 Connection 上（与 `id`、两端便签同属一条记录），不是独立于端点的另一条数据。
   * 规范化交换端点时仍保留在同一 `id` 下；若要显式标明标签贴近哪一端可填 `labelAnchorNoteId`。
   */
  label?: string;
  /** 若设置则须等于 `fromNoteId` 或 `toNoteId`；供展示定位与打开项目时的校验 */
  labelAnchorNoteId?: string;
  fromArrow?: 'arrow' | 'none'; // 起点端样式
  toArrow?: 'arrow' | 'none';   // 终点端样式
}

export interface Frame {
  id: string;
  title: string;
  description?: string; // 图层描述
  x: number;
  y: number;
  width: number;
  height: number;
  color: string; // 背景色
}

/** 图谱「标签分组」图层的顺序与显隐（tagGroup 与节点首标签一致；空串表示无标签组） */
export type TagVisibilityLogic = 'and' | 'or';

export interface GraphLayerState {
  order: string[];
  hidden: string[];
  /** 各分组环形/时间轴纵轴权重，范围 0.1～1，越大越靠近圆心、时间线纵轴越靠上 */
  weights?: Record<string, number>;
  /**
   * 多标签便签的显隐逻辑（仅标签层）：
   * - `and`：任一标签隐藏 → 隐藏节点
   * - `or`：任一标签显示 → 显示节点（默认）
   */
  tagVisibilityLogic?: TagVisibilityLogic;
}

export interface Project {
  id: string;
  name: string;
  /** 历史字段：图片背景模式已移除，固定为 map；业务类型见 projectKind */
  type: 'map';
  /**
   * 项目工作流类型：mapping=地图+看板；graph=关系图谱+看板。
   * 缺失时视为旧项目，打开时询问归类。
   */
  projectKind?: ProjectKind;
  backgroundImage?: string; // Deprecated, no longer used
  createdAt: number;
  notes: Note[];
  connections?: Connection[]; // Connections between notes in board view
  frames?: Frame[]; // Frames for grouping notes in board view
  standardSizeScale?: number; // Global scale factor for standard note sizes (default 1)
  version?: number; // Version number for incremental sync
  storageVersion?: number; // Storage format version
  backgroundOpacity?: number; // Background opacity for board view
  themeColor?: string; // Theme color for project
  /** 图谱视图：标签组排序与隐藏 / 权重（标签图层面板） */
  graphLayers?: GraphLayerState;
  /**
   * 历史字段：地图/看板图层面板仍可切换 tag|frame。
   * 图谱时间线固定按 frame，不再依赖此字段切换布局。
   */
  graphLayerStandard?: 'tag' | 'frame';
  /** 图谱视图：簇组排序与显隐 / 半径权重 */
  graphFrameLayers?: GraphLayerState;
  /** 图谱节点圆直径下限（px，1～36）；实际大小按关联节点数放大，上限 36 */
  graphNodeSize?: number;
  /** 图谱节点下方标题字号（px，4～16） */
  graphLabelFontPx?: number;
  /** 图谱连线粗细（0.1～2） */
  graphEdgeWeight?: number;
  /** 图谱边标签字号（px，3～16）；未设置时由样式默认值决定，不再与连线粗细联动 */
  graphEdgeLabelFontPx?: number;
  /**
   * 时间线布局：纵轴按 Frame 图层权重聚类的强度，0～1。
   * 0 为均匀随机；越大则高权重 Frame 越靠上、纵向散布越小。
   * 未设置时默认 0.8（80%）。
   */
  graphTimeAxisWeightBias?: number;
  /**
   * 历史：圆环布局力导向微调。圆环布局已移除，字段仅兼容旧项目。
   */
  graphCircleRefineOrderWithForce?: boolean;
  /**
   * 历史：力传导布局拖动时实时重算。功能已移除，字段仅兼容旧项目。
   */
  graphCoseDragRealtime?: boolean;
  /**
   * 图谱连线是否弯曲。
   * 开启时用 Cytoscape `unbundled-bezier`（bundled `bezier` 单边会画成直线）；
   * 关闭时为 `straight`。未设置时视为开启。
   */
  graphEdgeCurve?: boolean;
  /**
   * 无会话内布局缓存时，打开图谱使用的默认布局（时间线 / 力导）。
   */
  graphDefaultLayoutMode?: 'time' | 'cose';
  /** 关联面板「新建」时起点侧默认是否带箭头 */
  graphNewConnectionFromArrow?: 'arrow' | 'none';
  /** 关联面板「新建」时终点侧默认是否带箭头 */
  graphNewConnectionToArrow?: 'arrow' | 'none';
}

/** 项目工作流：mapping=地图+看板；graph=关系图谱（无看板） */
export type ProjectKind = 'mapping' | 'graph';

export type ViewMode = 'map' | 'board' | 'table' | 'graph';
