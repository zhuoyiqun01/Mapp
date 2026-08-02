import React, { useEffect, useRef } from 'react';
import type { Core } from 'cytoscape';
import { mapChromeSurfaceStyle } from '../../utils/map/mapChromeStyle';
import {
  collectGraphHighlightChromeLabels,
  graphHighlightChromePaintKey,
  paintGraphHighlightChromeLabels
} from '../../utils/graph/graphHighlightChromeLabels';

export type GraphHighlightChromeLabelsProps = {
  cyRef: React.RefObject<Core | null>;
  /** 与 cy 容器同尺寸的定位祖先 */
  hostRef: React.RefObject<HTMLElement | null>;
  chromeOpacity: number;
  chromeBlurPx: number;
  themeColor: string;
  nodeSize: number;
  /** 空闲 label 字号（设置面板节点标签字号） */
  labelFontPx: number;
  /** 高亮集合 / 数据变化时重算 */
  highlightKey: string;
};

/**
 * 节点 label（HTML）：空闲字叠在节点圆之上，仅用 scale(zoom) 同步缩放；
 * 有高亮时只画高亮字（避免 idle 字盖住高亮边/节点）；选中/悬停用玻璃 chrome（固定屏上 16/12px）。
 */
export const GraphHighlightChromeLabels: React.FC<GraphHighlightChromeLabelsProps> = ({
  cyRef,
  hostRef,
  chromeOpacity,
  chromeBlurPx,
  themeColor,
  nodeSize,
  labelFontPx,
  highlightKey
}) => {
  const layerRef = useRef<HTMLDivElement>(null);
  const lastKeyRef = useRef('');
  const chromeStyle = mapChromeSurfaceStyle(chromeOpacity, chromeBlurPx);

  useEffect(() => {
    let raf: number | null = null;
    const layer = layerRef.current;

    const sync = () => {
      raf = null;
      if (!layer) return;
      const cy = cyRef.current;
      if (!cy || cy.destroyed?.()) {
        if (lastKeyRef.current !== '') {
          lastKeyRef.current = '';
          layer.replaceChildren();
        }
        return;
      }

      const items = collectGraphHighlightChromeLabels(cy, nodeSize, themeColor, labelFontPx);
      const key = graphHighlightChromePaintKey(items);
      if (key === lastKeyRef.current) return;
      lastKeyRef.current = key;
      paintGraphHighlightChromeLabels(layer, items, chromeOpacity, chromeBlurPx);
    };

    const schedule = () => {
      if (raf != null) return;
      raf = requestAnimationFrame(sync);
    };

    sync();
    const cy = cyRef.current;
    if (!cy || cy.destroyed?.()) return;

    cy.on('viewport', schedule);
    cy.on('drag', 'node', schedule);
    cy.on('free', 'node', schedule);
    cy.on('layoutstop', schedule);
    cy.on('position', 'node', schedule);

    const host = hostRef.current;
    const ro =
      host && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    if (host && ro) ro.observe(host);

    return () => {
      if (raf != null) cancelAnimationFrame(raf);
      cy.removeListener('viewport', schedule);
      cy.removeListener('drag', 'node', schedule);
      cy.removeListener('free', 'node', schedule);
      cy.removeListener('layoutstop', schedule);
      cy.removeListener('position', 'node', schedule);
      ro?.disconnect();
    };
  }, [
    cyRef,
    hostRef,
    nodeSize,
    labelFontPx,
    themeColor,
    highlightKey,
    chromeOpacity,
    chromeBlurPx,
    chromeStyle.backgroundColor,
    chromeStyle.backdropFilter
  ]);

  return (
    <div
      ref={layerRef}
      className="absolute inset-0 z-[15] overflow-hidden pointer-events-none"
      aria-hidden
    />
  );
};
