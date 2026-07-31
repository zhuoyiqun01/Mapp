import React from 'react';
import type { Project } from '../types';
import {
  DEFAULT_GRAPH_STYLESHEET_SIZING,
  DEFAULT_GRAPH_TIME_AXIS_WEIGHT_BIAS
} from '../utils/graph/graphData';
import { SettingsCompactSlider } from './ui/SettingsCompactSlider';

export interface GraphStyleSettingsBlockProps {
  themeColor: string;
  project: Project;
  onPatch: (patch: Partial<Project>) => void;
}

/** 设置面板「Graph Style」：节点/边视觉、按 Frame 聚类强度 */
export const GraphStyleSettingsBlock: React.FC<GraphStyleSettingsBlockProps> = ({
  themeColor,
  project,
  onPatch
}) => {
  const nodeSize = project.graphNodeSize ?? DEFAULT_GRAPH_STYLESHEET_SIZING.nodeSize;
  const labelPx = project.graphLabelFontPx ?? DEFAULT_GRAPH_STYLESHEET_SIZING.labelFontPx;
  const edgeW = project.graphEdgeWeight ?? DEFAULT_GRAPH_STYLESHEET_SIZING.edgeWeight;
  const edgeLabelPx = project.graphEdgeLabelFontPx ?? DEFAULT_GRAPH_STYLESHEET_SIZING.edgeLabelFontPx;
  const timeBias = project.graphTimeAxisWeightBias ?? DEFAULT_GRAPH_TIME_AXIS_WEIGHT_BIAS;
  const edgeCurve = project.graphEdgeCurve !== false;

  return (
    <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
      <SettingsCompactSlider
        label="节点最小尺寸"
        themeColor={themeColor}
        value={nodeSize}
        min={1}
        max={36}
        step={1}
        onChange={(v) => onPatch({ graphNodeSize: Math.round(Math.min(36, Math.max(1, v))) })}
        formatValue={(v) => `${Math.round(v)}px`}
        minCaption="小"
        maxCaption="大"
      />
      <SettingsCompactSlider
        label="节点标签字号"
        themeColor={themeColor}
        value={labelPx}
        min={4}
        max={16}
        step={1}
        onChange={(v) => onPatch({ graphLabelFontPx: Math.round(Math.min(16, Math.max(4, v))) })}
        formatValue={(v) => `${Math.round(v)}px`}
        minCaption="小"
        maxCaption="大"
      />
      <div className="min-w-0">
        <SettingsCompactSlider
          label="连线粗细"
          themeColor={themeColor}
          value={edgeW}
          min={0.1}
          max={2}
          step={0.1}
          onChange={(v) => onPatch({ graphEdgeWeight: Math.min(2, Math.max(0.1, Math.round(v * 10) / 10)) })}
          formatValue={(v) => v.toFixed(1)}
          minCaption="细"
          maxCaption="粗"
        />
      </div>
      <div className="min-w-0">
        <SettingsCompactSlider
          label="边标签字号"
          themeColor={themeColor}
          value={edgeLabelPx}
          min={3}
          max={16}
          step={1}
          onChange={(v) => onPatch({ graphEdgeLabelFontPx: Math.round(Math.min(16, Math.max(3, v))) })}
          formatValue={(v) => `${Math.round(v)}px`}
          minCaption="小"
          maxCaption="大"
        />
      </div>
      <div className="min-w-0">
        <SettingsCompactSlider
          label="按Frame聚类"
          themeColor={themeColor}
          value={timeBias}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => onPatch({ graphTimeAxisWeightBias: Math.max(0, Math.min(1, v)) })}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          minCaption="弱"
          maxCaption="强"
        />
      </div>

      <label className="flex min-w-0 cursor-pointer items-center justify-between gap-3 sm:col-span-2">
        <span className="text-xs font-medium text-gray-600">连线曲线</span>
        <span
          className="inline-flex shrink-0 rounded outline-none focus-within:outline focus-within:outline-2 focus-within:outline-offset-2"
          style={{ outlineColor: `${themeColor}66` }}
        >
          <input
            type="checkbox"
            className="sr-only"
            checked={edgeCurve}
            onChange={(e) => onPatch({ graphEdgeCurve: e.target.checked })}
          />
          <span
            className={`flex h-4 w-4 items-center justify-center rounded transition-colors ${
              edgeCurve ? '' : 'border border-gray-200/90 bg-white'
            }`}
            style={edgeCurve ? { backgroundColor: themeColor } : undefined}
            aria-hidden
          >
            {edgeCurve ? (
              <svg viewBox="0 0 12 12" className="h-3 w-3 text-theme-chrome-fg" aria-hidden>
                <path
                  d="M2.5 6l2.5 2.5L9.5 3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : null}
          </span>
        </span>
      </label>
    </div>
  );
};
