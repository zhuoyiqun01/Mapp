
import React, { useState, useEffect } from 'react';
import { X, Settings, Palette, Map, Target, Zap } from 'lucide-react';
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
  pinSize?: number;
  onPinSizeChange?: (size: number) => void;
  clusterThreshold?: number;
  onClusterThresholdChange?: (threshold: number) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  onClose,
  themeColor,
  onThemeColorChange,
  currentMapStyle,
  onMapStyleChange,
  pinSize,
  onPinSizeChange,
  clusterThreshold,
  onClusterThresholdChange
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
      {/* Backdrop */}
      <div className="fixed inset-0 z-[5000] bg-black bg-opacity-50" onClick={onClose} />

      {/* Settings Card */}
      <div className="fixed top-1/2 left-4 right-4 z-[5001] max-w-sm sm:max-w-md transform -translate-y-1/2">
        <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
              <Settings size={20} className="text-gray-700" />
              <h2 className="text-xl font-semibold text-gray-900">Settings</h2>
          </div>
          <button
            onClick={onClose}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
              <X size={20} className="text-gray-600" />
          </button>
        </div>

        {/* Content */}
          <div className="max-h-[70vh] overflow-y-auto px-4 py-4">
          {/* Theme Color Section */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Palette size={18} className="text-gray-600" />
              <h3 className="text-base font-bold text-gray-700">Theme Color</h3>
            </div>
            <div className="flex items-center gap-3">
              <div 
                className="w-12 h-12 rounded-lg shadow-md border-2 border-gray-200 cursor-pointer transition-transform hover:scale-105"
                style={{ backgroundColor: themeColor }}
                onClick={() => setShowThemeColorPicker(true)}
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-700 mb-0.5">Current Theme Color</div>
                <div className="text-xs text-gray-500 font-mono">{themeColor}</div>
              </div>
              <button
                onClick={() => setShowThemeColorPicker(true)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Edit
              </button>
            </div>
          </div>

          {/* Map Style Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Map size={18} className="text-gray-600" />
              <h3 className="text-base font-bold text-gray-700">Map Style</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {MAP_STYLE_OPTIONS.map((style: MapStyleOption) => (
                <button
                  key={style.id}
                  onClick={() => handleMapStyleSelect(style.id)}
                  className={`p-3 rounded-lg border-2 transition-all text-left ${
                    currentMapStyle === style.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {style.preview && style.preview.startsWith('http') && !failedImages.has(style.id) ? (
                    <div className="w-full h-20 rounded-lg mb-2 shadow-sm overflow-hidden bg-gray-100">
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
            <div className="mt-3 text-sm text-gray-500">
              <p>Choose different map styles to change the appearance of the map.</p>
            </div>
          </div>

          {/* Map Controls Section */}
          {(pinSize !== undefined && onPinSizeChange && clusterThreshold !== undefined && onClusterThresholdChange) && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3">
                <Target size={18} className="text-gray-600" />
                <h3 className="text-base font-bold text-gray-700">Map Controls</h3>
              </div>

              {/* Pin Size Control */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-gray-700">Pin Size</label>
                  <span className="text-sm text-gray-500">{pinSize.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={pinSize}
                  onChange={(e) => onPinSizeChange(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-gray-200 rounded appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, ${themeColor} 0%, ${themeColor} ${(pinSize - 0.5) / (2.0 - 0.5) * 100}%, #e5e7eb ${(pinSize - 0.5) / (2.0 - 0.5) * 100}%, #e5e7eb 100%)`
                  }}
                />
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>0.5x</span>
                  <span>2.0x</span>
                </div>
              </div>

              {/* Cluster Threshold Control */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-gray-700">Cluster Threshold</label>
                  <span className="text-sm text-gray-500">{clusterThreshold}px</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="100"
                  step="5"
                  value={clusterThreshold}
                  onChange={(e) => onClusterThresholdChange(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-gray-200 rounded appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, ${themeColor} 0%, ${themeColor} ${(clusterThreshold - 1) / (100 - 1) * 100}%, #e5e7eb ${(clusterThreshold - 1) / (100 - 1) * 100}%, #e5e7eb 100%)`
                  }}
                />
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>1px</span>
                  <span>100px</span>
                </div>
                <div className="mt-1.5 text-sm text-gray-500">
                  <p>Distance threshold for grouping nearby pins into clusters.</p>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Theme Color Picker Modal */}
      {showThemeColorPicker && (
        <div className="fixed inset-0 z-[5100]">
        <ThemeColorPicker
          isOpen={showThemeColorPicker}
          onClose={() => setShowThemeColorPicker(false)}
          currentColor={themeColor}
          onColorChange={onThemeColorChange}
        />
        </div>
      )}
    </>
  );
};

