import React from 'react';
import { Image as ImageIcon, Square } from 'lucide-react';

export type BoardLayerVisibility = {
  frame: boolean;
  primary: boolean;
  image: boolean;
};

export type BoardLayerPanelProps = {
  themeColor: string;
  layerVisibility: BoardLayerVisibility;
  onLayerVisibilityChange: React.Dispatch<React.SetStateAction<BoardLayerVisibility>>;
};

export const BoardLayerPanel: React.FC<BoardLayerPanelProps> = ({
  themeColor,
  layerVisibility,
  onLayerVisibilityChange
}) => {
  const stop = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <div
      className="absolute left-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-[2000]"
      onPointerDown={stop}
      onClick={stop}
    >
      <div className="px-3 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide">Layer</div>
      <div className="h-px bg-gray-100 mb-1" />

      <div className="px-3 py-2 flex items-center justify-between hover:bg-gray-50">
        <div className="flex items-center gap-2">
          <Square size={16} className="text-gray-600" strokeWidth={2} />
          <span className="text-sm text-gray-700">Notes</span>
        </div>
        <input
          type="checkbox"
          checked={layerVisibility.primary}
          onChange={(e) => {
            e.stopPropagation();
            onLayerVisibilityChange((prev) => ({ ...prev, primary: !prev.primary }));
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className={`w-4 h-4 rounded border-2 cursor-pointer appearance-none ${
            layerVisibility.primary ? '' : 'bg-transparent'
          }`}
          style={{
            backgroundColor: layerVisibility.primary ? themeColor : 'transparent',
            borderColor: themeColor
          }}
        />
      </div>

      <div className="px-3 py-2 flex items-center justify-between hover:bg-gray-50">
        <div className="flex items-center gap-2">
          <ImageIcon size={16} className="text-gray-600" strokeWidth={2} />
          <span className="text-sm text-gray-700">Images</span>
        </div>
        <input
          type="checkbox"
          checked={layerVisibility.image}
          onChange={(e) => {
            e.stopPropagation();
            onLayerVisibilityChange((prev) => ({ ...prev, image: !prev.image }));
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className={`w-4 h-4 rounded border-2 cursor-pointer appearance-none ${
            layerVisibility.image ? '' : 'bg-transparent'
          }`}
          style={{
            backgroundColor: layerVisibility.image ? themeColor : 'transparent',
            borderColor: themeColor
          }}
        />
      </div>

      <div className="px-3 py-2 flex items-center justify-between hover:bg-gray-50">
        <div className="flex items-center gap-2">
          <Square size={16} className="text-gray-600" strokeWidth={2} />
          <span className="text-sm text-gray-700">Frames</span>
        </div>
        <input
          type="checkbox"
          checked={layerVisibility.frame}
          onChange={(e) => {
            e.stopPropagation();
            onLayerVisibilityChange((prev) => ({ ...prev, frame: !prev.frame }));
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className={`w-4 h-4 rounded border-2 cursor-pointer appearance-none ${
            layerVisibility.frame ? '' : 'bg-transparent'
          }`}
          style={{
            backgroundColor: layerVisibility.frame ? themeColor : 'transparent',
            borderColor: themeColor
          }}
        />
      </div>
    </div>
  );
};

