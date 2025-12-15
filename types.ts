
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
  
  // Board View Position
  boardX: number;
  boardY: number;
  
  // Type of note
  variant: 'standard' | 'compact' | 'image';
  imageWidth?: number;
  imageHeight?: number;
  
  // Group/Frame membership
  groupId?: string; // Frame ID if note is in a frame (backward compatibility, first frame)
  groupName?: string; // Frame name for export (backward compatibility, first frame name)
  groupIds?: string[]; // Frame IDs if note is in multiple frames
  groupNames?: string[]; // Frame names for export (multiple frames)
  
  // Layout scale for board view
  layoutScale?: number; // Scale factor for layout (default 1)
}

export interface Connection {
  id: string;
  fromNoteId: string;
  toNoteId: string;
  fromSide: 'top' | 'right' | 'bottom' | 'left';
  toSide: 'top' | 'right' | 'bottom' | 'left';
  arrow?: 'none' | 'forward' | 'reverse'; // 箭头方向：无、正向、反向
}

export interface Frame {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string; // 背景色
}

export interface Project {
  id: string;
  name: string;
  type: 'map' | 'image';
  backgroundImage?: string; // Base64 string for image mode, or 'stored' if stored separately
  createdAt: number;
  notes: Note[];
  connections?: Connection[]; // Connections between notes in board view
  frames?: Frame[]; // Frames for grouping notes in board view
  standardSizeScale?: number; // Global scale factor for standard note sizes (default 1)
  version?: number; // Version number for incremental sync
  storageVersion?: number; // Storage format version
}

export type ViewMode = 'map' | 'board' | 'table';