
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
  
  // Group/Frame membership
  groupId?: string; // Frame ID if note is in a frame (backward compatibility, first frame)
  groupName?: string; // Frame name for export (backward compatibility, first frame name)
  groupIds?: string[]; // Frame IDs if note is in multiple frames
  groupNames?: string[]; // Frame names for export (multiple frames)
  
  // Layout scale for board view
  layoutScale?: number; // Scale factor for layout (default 1)

  // Lightweight note group (not a visual Frame; used for multi-select auto-group)
  noteGroupId?: string;
}

export interface Connection {
  id: string;
  fromNoteId: string;
  toNoteId: string;
  fromSide: 'top' | 'right' | 'bottom' | 'left';
  toSide: 'top' | 'right' | 'bottom' | 'left';
  arrow?: 'none' | 'forward' | 'reverse'; // 箭头方向：无、正向、反向
  label?: string; // 连线文本标签
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
export interface GraphLayerState {
  order: string[];
  hidden: string[];
  /** 各标签组环形/时间轴纵轴权重，范围 0.1～1，越大离圆心越远、时间线纵轴越靠上 */
  weights?: Record<string, number>;
}

export interface Project {
  id: string;
  name: string;
  type: 'map';
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
  /** 图谱视图：标签组排序与隐藏（影响标签网格布局的组顺序） */
  graphLayers?: GraphLayerState;
  /** 图谱节点圆直径（px，4～36） */
  graphNodeSize?: number;
  /** 图谱节点下方标题字号（px，4～16） */
  graphLabelFontPx?: number;
  /** 图谱连线粗细与边标签字号联动（0.1～2） */
  graphEdgeWeight?: number;
  /**
   * 时间线布局：纵轴受图层面板「半径权重」牵引的强度，0～1。
   * 0 为原先均匀随机；越大则高权重组越靠上、纵向随机散布越小。
   */
  graphTimeAxisWeightBias?: number;
  /**
   * 圆环布局：是否在分层与扇区划分不变的前提下，用短时力导向结果按极角微调同扇区内节点顺序（减轻交叉）。
   * 未设置时视为开启。
   */
  graphCircleRefineOrderWithForce?: boolean;
  /**
   * 无会话内布局缓存时，打开图谱使用的默认二级布局（与底部四钮一致）。
   * 同会话内仍以 sessionStorage 与底部工具栏为准。
   */
  graphDefaultLayoutMode?: 'tagGrid' | 'circle' | 'time' | 'cose';
  /** 关联面板「新建」时起点侧默认是否带箭头 */
  graphNewConnectionFromArrow?: 'arrow' | 'none';
  /** 关联面板「新建」时终点侧默认是否带箭头 */
  graphNewConnectionToArrow?: 'arrow' | 'none';
}

export type ViewMode = 'map' | 'board' | 'table' | 'graph';
