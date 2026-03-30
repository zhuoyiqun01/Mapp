import React from 'react';
import type { Frame, GraphLayerState, Note } from '../../types';
import type { GraphLayerGroupStandard } from '../../utils/graph/graphRuntimeCore';
import { ProjectNotesLayerPanel } from '../layer/ProjectNotesLayerPanel';

export interface GraphLayerPanelProps {
  themeColor: string;
  panelChromeStyle?: React.CSSProperties;
  merged: GraphLayerState;
  layerGroupStandard: GraphLayerGroupStandard;
  onLayerGroupStandardChange: (standard: GraphLayerGroupStandard) => void;
  onStateChange: (next: GraphLayerState) => void;
  notes: Note[];
  onUpdateNote: (note: Note) => void;
  onBatchUpdateNotes?: (nextNotes: Note[]) => void | Promise<void>;
  frames: Frame[];
  projectId: string;
  onActivateNote?: (note: Note) => void;
}

/** @deprecated 请优先使用 `ProjectNotesLayerPanel`；本组件保留为图谱顶栏 graph 变体 */
export const GraphLayerPanel: React.FC<GraphLayerPanelProps> = (props) => (
  <ProjectNotesLayerPanel {...props} variant="graph" embed={false} dockAlign="start" />
);
