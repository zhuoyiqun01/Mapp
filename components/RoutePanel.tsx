import React, { useState } from 'react';
import { Note } from '../types';
import { X, Route, GripVertical } from 'lucide-react';

interface RoutePanelProps {
  isRouteMode: boolean;
  waypoints: Note[];
  onRemoveWaypoint: (noteId: string) => void;
  onReorderWaypoints?: (waypoints: Note[]) => void;
  travelMode: 'walking' | 'driving';
  onTravelModeChange: (mode: 'walking' | 'driving') => void;
  themeColor: string;
  onExitRouteMode: () => void;
  dropZoneRef?: React.RefObject<HTMLDivElement>;
}

export const RoutePanel: React.FC<RoutePanelProps> = ({
  isRouteMode,
  waypoints,
  onRemoveWaypoint,
  onReorderWaypoints,
  travelMode,
  onTravelModeChange,
  themeColor,
  onExitRouteMode,
  dropZoneRef
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();

    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      return;
    }

    // 重新排列航点
    const newWaypoints = [...waypoints];
    const [draggedItem] = newWaypoints.splice(draggedIndex, 1);
    newWaypoints.splice(dropIndex, 0, draggedItem);

    onReorderWaypoints?.(newWaypoints);
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };
  if (!isRouteMode) return null;

  return (
    <div
      className="fixed right-4 top-1/2 -translate-y-1/2 z-[1000] w-80 max-h-[80vh] overflow-hidden"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Route size={20} style={{ color: themeColor }} />
            路线规划
          </h3>
          <button
            onClick={onExitRouteMode}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        {/* Travel Mode Selector */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">出行方式:</span>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => onTravelModeChange('walking')}
                className={`px-3 py-1 text-sm font-medium transition-colors ${
                  travelMode === 'walking'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                步行
              </button>
              <button
                onClick={() => onTravelModeChange('driving')}
                className={`px-3 py-1 text-sm font-medium transition-colors ${
                  travelMode === 'driving'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                自驾
              </button>
            </div>
          </div>
        </div>

        {/* Waypoints List */}
        <div className="p-4">
          <div className="text-sm font-medium text-gray-700 mb-3">
            航点列表 ({waypoints.length})
          </div>

          {waypoints.length === 0 ? (
            /* Drop Zone */
            <div
              ref={dropZoneRef}
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center transition-colors hover:border-blue-400"
              style={{ borderColor: 'var(--theme-color, #3B82F6)' }}
            >
              <div className="text-gray-500 text-sm">
                长按地图上的点位并拖拽到此处
              </div>
            </div>
          ) : (
            /* Waypoints List */
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {waypoints.map((waypoint, index) => (
                <div
                  key={waypoint.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-move transition-all ${
                    draggedIndex === index ? 'opacity-50 scale-95' : 'hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <GripVertical size={16} className="text-gray-400" />
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ backgroundColor: themeColor }}
                    >
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {waypoint.text || `点位 ${index + 1}`}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveWaypoint(waypoint.id);
                    }}
                    className="p-1 hover:bg-gray-200 rounded transition-colors"
                  >
                    <X size={14} className="text-gray-400" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {waypoints.length > 1 && (
            <button
              className="w-full mt-4 py-2 px-4 rounded-lg font-medium transition-colors text-white"
              style={{ backgroundColor: themeColor }}
              onClick={() => {
                // TODO: Calculate route
                console.log('Calculate route for waypoints:', waypoints);
              }}
            >
              计算路线
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
