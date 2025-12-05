
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
  color?: string; // Background color
  images: string[]; // Base64 strings
  sketch?: string; // Base64 string from canvas
  tags: Tag[];
  
  // Board View Position
  boardX: number;
  boardY: number;
  
  // Type of note
  variant?: 'standard' | 'text' | 'compact';
  
  // Group/Frame membership
  groupId?: string; // Frame ID if note is in a frame
  groupName?: string; // Frame name for export
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
  backgroundImage?: string; // Base64 string for image mode
  createdAt: number;
  notes: Note[];
  connections?: Connection[]; // Connections between notes in board view
  frames?: Frame[]; // Frames for grouping notes in board view
}

export type ViewMode = 'map' | 'board' | 'table';