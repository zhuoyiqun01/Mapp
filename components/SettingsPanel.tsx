
import React, { useState, useEffect } from 'react';
import { X, Settings, Palette, Map } from 'lucide-react';
import { get, set } from 'idb-keyval';
import { MAP_STYLE_OPTIONS, MapStyleOption } from '../constants';
import { ThemeColorPicker } from './ThemeColorPicker';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  themeColor: string;
  onThemeColorChange: (color: string) => void;
  currentMapStyle: string;
  onMapStyleChange: (styleId: string) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  onClose,
  themeColor,
  onThemeColorChange,
  currentMapStyle,
  onMapStyleChange
}) => {
  const [showThemeColorPicker, setShowThemeColorPicker] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  const handleMapStyleSelect = (styleId: string) => {
    onMapStyleChange(styleId);
    set('mapp-map-style', styleId);
  };

  return (
    <>
      <div className="fixed inset-0 z-[5000] bg-white flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Settings size={24} className="text-gray-700" />
            <h2 className="text-2xl font-bold text-gray-800">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={24} className="text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Theme Color Section */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Palette size={20} className="text-gray-600" />
              <h3 className="text-lg font-bold text-gray-700">Theme Color</h3>
            </div>
            <div className="flex items-center gap-4">
              <div 
                className="w-16 h-16 rounded-xl shadow-md border-2 border-gray-200 cursor-pointer transition-transform hover:scale-105"
                style={{ backgroundColor: themeColor }}
                onClick={() => setShowThemeColorPicker(true)}
              />
              <div className="flex-1">
                <div className="text-base font-medium text-gray-700 mb-1">Current Theme Color</div>
                <div className="text-sm text-gray-500 font-mono">{themeColor}</div>
              </div>
              <button
                onClick={() => setShowThemeColorPicker(true)}
                className="px-6 py-3 text-base font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Edit
              </button>
            </div>
          </div>

          {/* Map Style Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Map size={20} className="text-gray-600" />
              <h3 className="text-lg font-bold text-gray-700">Map Style</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {MAP_STYLE_OPTIONS.map((style: MapStyleOption) => (
                <button
                  key={style.id}
                  onClick={() => handleMapStyleSelect(style.id)}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    currentMapStyle === style.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {style.preview && style.preview.startsWith('http') && !failedImages.has(style.id) ? (
                    <div className="w-full h-24 rounded-lg mb-3 shadow-sm overflow-hidden bg-gray-100">
                      <img 
                        src={style.preview} 
                        alt={style.name}
                        className="w-full h-full object-cover"
                        onError={() => {
                          setFailedImages(prev => new Set(prev).add(style.id));
                        }}
                      />
                    </div>
                  ) : null}
                  <div className="text-sm font-medium text-gray-700">{style.name}</div>
                </button>
              ))}
            </div>
            <div className="mt-4 text-sm text-gray-500">
              <p>Choose different map styles to change the appearance of the map.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Theme Color Picker Modal */}
      {showThemeColorPicker && (
        <ThemeColorPicker
          isOpen={showThemeColorPicker}
          onClose={() => setShowThemeColorPicker(false)}
          currentColor={themeColor}
          onColorChange={onThemeColorChange}
        />
      )}
    </>
  );
};

