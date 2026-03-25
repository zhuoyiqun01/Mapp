import React, { useEffect, useState } from 'react';
import type { Core } from 'cytoscape';
import { computeTimeAxisTicks, type TimeAxisTick } from '../../utils/graph/graphTimeAxisMath';

/** 与样式 top-[58%]、h-9 对应的纵向命中带（相对容器高度比例 + 半高 px） */
const AXIS_TOP_RATIO = 0.58;
const AXIS_HALF_BAND_PX = 26;

type Props = {
  cyRef: React.RefObject<Core | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  themeColor: string;
  visible: boolean;
  /** cy 重建后重新订阅 viewport */
  graphStructureKey: string;
};

/**
 * 时间线布局：中间偏下横轴刻度。无背景框。
 * 层级：紧贴 Cytoscape canvas（z-10）之上 z-11；悬停 z-12 + 不透明度（仍低于顶栏/底栏等 UI）。
 * pointer-events-none，悬停靠容器 mousemove 判断，不挡点线交互。
 */
export const GraphTimeAxisRuler: React.FC<Props> = ({
  cyRef,
  containerRef,
  themeColor,
  visible,
  graphStructureKey
}) => {
  const [ticks, setTicks] = useState<TimeAxisTick[]>([]);
  const [bandHovered, setBandHovered] = useState(false);

  useEffect(() => {
    if (!visible) {
      setTicks([]);
      setBandHovered(false);
      return;
    }

    const measureAndUpdate = () => {
      const cy = cyRef.current;
      const el = containerRef.current;
      if (!cy || !el) {
        setTicks([]);
        return;
      }
      const w = el.getBoundingClientRect().width;
      setTicks(computeTimeAxisTicks(cy, w));
    };

    const cy = cyRef.current;
    const el = containerRef.current;
    if (!cy || !el) return;

    measureAndUpdate();
    const ro = new ResizeObserver(() => measureAndUpdate());
    ro.observe(el);
    const onVp = () => measureAndUpdate();
    cy.on('viewport', onVp);

    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const y = e.clientY - r.top;
      const mid = r.height * AXIS_TOP_RATIO;
      const inBand = y >= mid - AXIS_HALF_BAND_PX && y <= mid + AXIS_HALF_BAND_PX;
      setBandHovered(inBand);
    };
    const onLeave = () => setBandHovered(false);
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);

    return () => {
      ro.disconnect();
      cy.removeListener('viewport', onVp);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [visible, graphStructureKey, cyRef, containerRef]);

  if (!visible || ticks.length === 0) return null;

  return (
    <div
      className={`pointer-events-none absolute left-2 right-2 top-[58%] h-9 -translate-y-1/2 select-none transition-opacity duration-150 ${
        bandHovered ? 'z-[12] opacity-100' : 'z-[11] opacity-[0.42]'
      }`}
      aria-hidden
    >
      <div
        className={`absolute left-0 right-0 top-1.5 h-px ${bandHovered ? 'opacity-95' : 'opacity-60'}`}
        style={{ backgroundColor: themeColor }}
      />
      <div className="relative h-full px-0.5 pt-2">
        {ticks.map((t) => (
          <div
            key={t.key}
            className="absolute top-1 flex flex-col items-center"
            style={{
              left: `${t.leftPct}%`,
              transform: 'translateX(-50%)'
            }}
          >
            <div className={`h-1.5 w-px ${bandHovered ? 'bg-gray-500' : 'bg-gray-400/80'}`} />
            <span
              className={`mt-0.5 text-[10px] font-semibold tabular-nums max-w-[4.5rem] truncate ${
                bandHovered ? 'text-gray-800' : 'text-gray-500'
              }`}
            >
              {t.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
