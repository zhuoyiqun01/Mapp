import React, { CSSProperties, MutableRefObject } from 'react';
import { Check, X } from 'lucide-react';
import type { Connection } from '../../types';

export type BoardConnectionQuickEditBarProps = {
  barStyle: CSSProperties;
  themeColor: string;
  connections: Connection[];
  selectedConnectionId: string;
  fromArrowValue: 'arrow' | 'none';
  toArrowValue: 'arrow' | 'none';
  editingConnectionLabel: string;
  editingConnectionLabelRef: MutableRefObject<string>;
  onUpdateConnections?: (connections: Connection[]) => void;
  onAfterDelete: () => void;
  onEditingConnectionLabelChange: (v: string) => void;
};

export const BoardConnectionQuickEditBar: React.FC<BoardConnectionQuickEditBarProps> = ({
  barStyle,
  themeColor,
  connections,
  selectedConnectionId,
  fromArrowValue,
  toArrowValue,
  editingConnectionLabel,
  editingConnectionLabelRef,
  onUpdateConnections,
  onAfterDelete,
  onEditingConnectionLabelChange
}) => {
  const stop = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  const updateConnection = (patch: Partial<Connection>) => {
    if (!onUpdateConnections) return;
    const updated = connections.map((c) => (c.id === selectedConnectionId ? { ...c, ...patch } : c));
    onUpdateConnections(updated);
  };

  const deleteConnection = () => {
    if (onUpdateConnections) {
      const updated = connections.filter((c) => c.id !== selectedConnectionId);
      onUpdateConnections(updated);
    }
    onAfterDelete();
  };

  return (
    <div data-allow-context-menu className="fixed z-[6000] pointer-events-auto" style={barStyle}>
      <div className="bg-white/95 backdrop-blur rounded-xl shadow-lg border border-gray-100 px-2 py-1.5 flex items-center gap-2">
        <input
          type="text"
          value={editingConnectionLabel}
          onChange={(e) => {
            const v = e.target.value;
            editingConnectionLabelRef.current = v;
            onEditingConnectionLabelChange(v);
          }}
          className="text-xs px-2 py-1 rounded-lg border outline-none min-w-[80px] max-w-[180px]"
          style={{ borderColor: themeColor }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const labelToSave =
                (editingConnectionLabelRef.current || editingConnectionLabel).trim() || undefined;
              updateConnection({ label: labelToSave });
            }
          }}
        />

        <select
          value={fromArrowValue}
          onChange={(e) => {
            e.stopPropagation();
            const value = e.target.value as 'arrow' | 'none';
            updateConnection({ fromArrow: value });
          }}
          className="text-[10px] rounded border bg-white px-1 py-0.5"
          style={{ borderColor: '#E5E7EB' }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <option value="none">-</option>
          <option value="arrow">←</option>
        </select>

        <select
          value={toArrowValue}
          onChange={(e) => {
            e.stopPropagation();
            const value = e.target.value as 'arrow' | 'none';
            updateConnection({ toArrow: value });
          }}
          className="text-[10px] rounded border bg-white px-1 py-0.5"
          style={{ borderColor: '#E5E7EB' }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <option value="none">-</option>
          <option value="arrow">→</option>
        </select>

        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            const labelToSave =
              (editingConnectionLabelRef.current || editingConnectionLabel).trim() || undefined;
            updateConnection({ label: labelToSave });
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="p-1 rounded-lg text-xs font-medium text-theme-chrome-fg"
          style={{ backgroundColor: themeColor }}
          title="保存标签"
        >
          <Check size={12} />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            deleteConnection();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="p-1 rounded-lg text-xs font-medium text-white bg-red-500 hover:bg-red-600 transition-colors"
          title="Delete connection"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
};

