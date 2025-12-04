
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
}

export interface Project {
  id: string;
  name: string;
  type: 'map' | 'image';
  backgroundImage?: string; // Base64 string for image mode
  createdAt: number;
  notes: Note[];
}

export type ViewMode = 'map' | 'board';