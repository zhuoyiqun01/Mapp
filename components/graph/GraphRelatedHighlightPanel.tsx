import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type {
  RelatedEdgeLabelColumn,
  RelatedEdgeLabelEntry,
  RelatedEdgeLabelGroups
} from '../../utils/graph/graphRuntimeCore';

export type GraphRelatedHighlightPanelProps = {
  groups: RelatedEdgeLabelGroups;
  selectedKeys: Set<string>;
  onToggleKey: (key: string) => void;
  onToggleColumn: (column: RelatedEdgeLabelColumn) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  themeColor: string;
  chromeSurfaceStyle?: React.CSSProperties;
  /**
   * 嵌入父级堆叠容器时：相对定位，排在详情卡下方。
   * 为 false 时保持独立 fixed（兼容旧用法）。
   */
  embedded?: boolean;
};

function LabelColumn({
  title,
  column,
  entries,
  selectedKeys,
  onToggleKey,
  onToggleColumn,
  themeColor
}: {
  title: string;
  column: RelatedEdgeLabelColumn;
  entries: RelatedEdgeLabelEntry[];
  selectedKeys: Set<string>;
  onToggleKey: (key: string) => void;
  onToggleColumn: (column: RelatedEdgeLabelColumn) => void;
  themeColor: string;
}) {
  const allOn = entries.length > 0 && entries.every((e) => selectedKeys.has(e.key));

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1.5 flex items-center justify-between gap-1">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{title}</div>
        {entries.length > 0 ? (
          <button
            type="button"
            onClick={() => onToggleColumn(column)}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            title={allOn ? `隐藏全部 ${title}` : `显示全部 ${title}`}
            aria-label={allOn ? `隐藏全部 ${title}` : `显示全部 ${title}`}
          >
            {allOn ? (
              <Eye size={13} strokeWidth={2} aria-hidden />
            ) : (
              <EyeOff size={13} strokeWidth={2} aria-hidden />
            )}
          </button>
        ) : null}
      </div>
      {entries.length === 0 ? (
        <p className="text-[11px] text-gray-400">—</p>
      ) : (
        <ul className="space-y-0.5">
          {entries.map((entry) => {
            const checked = selectedKeys.has(entry.key);
            const inputId = `graph-rel-${entry.key === `${entry.column}\u0001` ? `${entry.column}-empty` : encodeURIComponent(entry.key)}`;
            return (
              <li key={entry.key}>
                <label
                  htmlFor={inputId}
                  className={`flex cursor-pointer items-center gap-1.5 py-0.5 text-left text-xs ${
                    checked ? 'text-gray-800' : 'text-gray-400'
                  }`}
                >
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleKey(entry.key)}
                    className="h-3.5 w-3.5 shrink-0 rounded border-gray-300"
                    style={{ accentColor: themeColor }}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium" title={entry.label}>
                    {entry.label}
                  </span>
                  <span className="shrink-0 tabular-nums text-[10px] text-gray-400">{entry.count}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * 选中节点详情下方：按边标签临时筛选关联高亮；From / To 两栏。
 */
export const GraphRelatedHighlightPanel: React.FC<GraphRelatedHighlightPanelProps> = ({
  groups,
  selectedKeys,
  onToggleKey,
  onToggleColumn,
  onSelectAll,
  onClearAll,
  themeColor,
  chromeSurfaceStyle,
  embedded = true
}) => {
  const total = groups.from.length + groups.to.length;
  const selectedCount =
    groups.from.reduce((n, e) => n + (selectedKeys.has(e.key) ? 1 : 0), 0) +
    groups.to.reduce((n, e) => n + (selectedKeys.has(e.key) ? 1 : 0), 0);

  return (
    <div
      data-allow-context-menu
      className={`${
        embedded
          ? 'relative w-72 sm:w-80 shrink-0 min-h-0'
          : 'fixed ui-workspace-left z-[1000] w-72 sm:w-80'
      } rounded-2xl shadow-2xl border border-gray-100/80 overflow-hidden animate-in slide-in-from-top-2 duration-300 ease-out flex flex-col pointer-events-auto ${
        chromeSurfaceStyle ? '' : 'bg-white'
      }`}
      style={{
        maxHeight: embedded ? 'min(40dvh, 22rem)' : 'calc(100dvh - 5rem)',
        ...chromeSurfaceStyle
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="shrink-0 flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">关联</div>
          <div className="truncate text-sm font-semibold text-gray-900">
            高亮筛选
            {total > 0 ? (
              <span className="ml-1 font-medium text-gray-400">
                {selectedCount}/{total}
              </span>
            ) : null}
          </div>
        </div>
        {total > 0 ? (
          <span className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={onSelectAll}
              className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            >
              全选
            </button>
            <button
              type="button"
              onClick={onClearAll}
              className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            >
              清空
            </button>
          </span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 theme-surface-scrollbar">
        {total === 0 ? (
          <p className="text-xs text-gray-400">当前关系链内暂无连线。</p>
        ) : (
          <div className="flex gap-4">
            <LabelColumn
              title="From"
              column="from"
              entries={groups.from}
              selectedKeys={selectedKeys}
              onToggleKey={onToggleKey}
              onToggleColumn={onToggleColumn}
              themeColor={themeColor}
            />
            <div className="w-px shrink-0 self-stretch bg-gray-100" aria-hidden />
            <LabelColumn
              title="To"
              column="to"
              entries={groups.to}
              selectedKeys={selectedKeys}
              onToggleKey={onToggleKey}
              onToggleColumn={onToggleColumn}
              themeColor={themeColor}
            />
          </div>
        )}
      </div>
    </div>
  );
};
