import React, { useState, useEffect, useMemo } from 'react';
import { X, Palette } from 'lucide-react';
import { get, set } from 'idb-keyval';
import { getThemeChromeForegroundHex } from '../utils/theme/themeChrome';
import { DEFAULT_MAP_UI_CHROME_BLUR_PX, DEFAULT_MAP_UI_CHROME_OPACITY, mapChromeSurfaceStyle } from '../utils/map/mapChromeStyle';

interface ThemeColorPickerProps {
  isOpen: boolean;
  onClose: () => void;
  currentColor: string;
  onColorChange: (color: string) => void;
  /** 与设置面板卡片一致的玻璃底 */
  panelChromeStyle?: React.CSSProperties;
}

export const ThemeColorPicker: React.FC<ThemeColorPickerProps> = ({ 
  isOpen, 
  onClose, 
  currentColor, 
  onColorChange,
  panelChromeStyle
}) => {
  const [hsl, setHsl] = useState({ h: 50, s: 100, l: 50 });
  const [hex, setHex] = useState('#FFDD00');

  // Convert Hex to HSL
  function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
    const rgb = hexToRgb(hex);
    if (!rgb) return null;
    return rgbToHsl(rgb.r, rgb.g, rgb.b);
  }

  // Convert RGB to HSL
  function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100)
    };
  }

  // Convert HSL to RGB
  function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
    h /= 360;
    s /= 100;
    l /= 100;

    let r, g, b;

    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;

      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }

    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    };
  }

  function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  function rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(x => {
      const hex = Math.max(0, Math.min(255, x)).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('').toUpperCase();
  }

  // Initialize from current color
  useEffect(() => {
    if (currentColor) {
      setHex(currentColor);
      const hslValue = hexToHsl(currentColor);
      if (hslValue) {
        setHsl(hslValue);
      }
    }
  }, [currentColor]);

  // Update hex when HSL changes
  useEffect(() => {
    const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
    const newHex = rgbToHex(rgb.r, rgb.g, rgb.b);
    setHex(newHex);
  }, [hsl]);

  // Load saved theme color on mount
  useEffect(() => {
    const loadThemeColor = async () => {
      const saved = await get<string>('mapp-theme-color');
      if (saved) {
        setHex(saved);
        const hslValue = hexToHsl(saved);
        if (hslValue) {
          setHsl(hslValue);
        }
      }
    };
    loadThemeColor();
  }, []);

  function handleHslChange(channel: 'h' | 's' | 'l', value: number) {
    setHsl(prev => ({ ...prev, [channel]: value }));
  }

  function handleHexChange(raw: string) {
    let v = raw.trim().toUpperCase();
    if (!v.startsWith('#')) {
      v = '#' + v.replace(/^#+/, '');
    }
    const cleanValue = v.replace('#', '');
    if (!/^[0-9A-Fa-f]{0,6}$/.test(cleanValue)) return;
    const newHex = '#' + cleanValue.toUpperCase();
    setHex(newHex);
    if (cleanValue.length === 6) {
      const hslValue = hexToHsl(newHex);
      if (hslValue) {
        setHsl(hslValue);
      }
    }
  }

  /** 预览块背景：完整 6 位 hex 用其本身，否则用当前 HSL 以免非法 CSS 颜色 */
  const previewBackground = useMemo(() => {
    if (/^#[0-9A-Fa-f]{6}$/i.test(hex)) {
      return hex;
    }
    const { r, g, b } = hslToRgb(hsl.h, hsl.s, hsl.l);
    return rgbToHex(r, g, b);
  }, [hex, hsl.h, hsl.s, hsl.l]);

  const previewChromeFg = useMemo(
    () => getThemeChromeForegroundHex(previewBackground),
    [previewBackground]
  );

  const applyBaseBg = useMemo(
    () => (/^#[0-9A-Fa-f]{6}$/i.test(hex) ? hex : previewBackground),
    [hex, previewBackground]
  );

  const applyButtonFg = useMemo(() => getThemeChromeForegroundHex(applyBaseBg), [applyBaseBg]);

  function handleApply() {
    // Just notify parent - let parent handle all updates
    onColorChange(hex);
    onClose();
  }

  function handleReset() {
    const defaultColor = '#FFDD00';
    const defaultHsl = hexToHsl(defaultColor);
    if (defaultHsl) {
      setHsl(defaultHsl);
      setHex(defaultColor);
    }
  }

  if (!isOpen) return null;

  const cardChrome =
    panelChromeStyle ??
    mapChromeSurfaceStyle(DEFAULT_MAP_UI_CHROME_OPACITY, DEFAULT_MAP_UI_CHROME_BLUR_PX);

  return (
    <div className="km-theme-color-picker fixed inset-0 z-[6000] min-h-[100dvh] min-h-screen w-full bg-black/50 flex items-center justify-center p-4">
      <style>{`
        .km-theme-color-picker input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
          cursor: pointer;
        }
        .km-theme-color-picker input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 2px;
          height: 20px;
          background: #000;
          border: none;
          cursor: pointer;
        }
        .km-theme-color-picker input[type="range"]::-moz-range-thumb {
          width: 2px;
          height: 20px;
          background: #000;
          border: none;
          cursor: pointer;
        }
      `}</style>
      <div
        className="rounded-xl shadow-2xl w-full max-w-md p-4 animate-in zoom-in-95 border border-gray-200/80"
        style={cardChrome}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Palette size={20} className="text-gray-700" />
            <h2 className="text-xl font-bold text-gray-800">Theme Color</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={18} className="text-gray-600" />
          </button>
        </div>

        {/* 预览 + 内联 Hex 编辑 */}
        <div className="mb-4">
          <div
            className="flex h-16 w-full items-center justify-center rounded-lg px-3 shadow-inner"
            style={{ backgroundColor: previewBackground }}
          >
            <input
              type="text"
              value={hex}
              onChange={(e) => handleHexChange(e.target.value)}
              className={`max-w-[10.5rem] w-full border-0 bg-transparent text-center font-mono text-base font-bold outline-none focus:ring-2 focus:ring-offset-0 rounded-md px-1 py-0.5 ${
                previewChromeFg === '#ffffff'
                  ? 'drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)] focus:ring-white/45'
                  : 'focus:ring-black/20'
              }`}
              style={{ color: previewChromeFg }}
              spellCheck={false}
              autoComplete="off"
              aria-label="十六进制颜色"
            />
          </div>
        </div>

        {/* HSL Sliders */}
        <div className="mb-4">
          <div className="text-xs font-medium text-gray-600 mb-2">HSL (HSV)</div>
          
          {/* Hue Slider */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-500">Hue (H)</label>
              <span className="text-xs font-mono text-gray-700">{hsl.h}°</span>
            </div>
            <input
              type="range"
              min="0"
              max="360"
              value={hsl.h}
              onChange={(e) => handleHslChange('h', parseInt(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, 
                  hsl(0, 100%, 50%), 
                  hsl(60, 100%, 50%), 
                  hsl(120, 100%, 50%), 
                  hsl(180, 100%, 50%), 
                  hsl(240, 100%, 50%), 
                  hsl(300, 100%, 50%), 
                  hsl(360, 100%, 50%))`
              }}
            />
          </div>

          {/* Saturation Slider */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-500">Saturation (S)</label>
              <span className="text-xs font-mono text-gray-700">{hsl.s}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={hsl.s}
              onChange={(e) => handleHslChange('s', parseInt(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, 
                  hsl(${hsl.h}, 0%, ${hsl.l}%), 
                  hsl(${hsl.h}, 100%, ${hsl.l}%))`
              }}
            />
          </div>

          {/* Lightness Slider */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-500">Lightness (L)</label>
              <span className="text-xs font-mono text-gray-700">{hsl.l}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={hsl.l}
              onChange={(e) => handleHslChange('l', parseInt(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, 
                  hsl(${hsl.h}, ${hsl.s}%, 0%), 
                  hsl(${hsl.h}, ${hsl.s}%, 50%), 
                  hsl(${hsl.h}, ${hsl.s}%, 100%))`
              }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className="flex-1 py-2 text-sm text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors"
          >
            Reset
          </button>
          <button
            onClick={handleApply}
            className="flex-1 py-2 text-sm font-bold rounded-lg shadow-lg transition-colors"
            style={{ backgroundColor: applyBaseBg, color: applyButtonFg }}
            onMouseEnter={(e) => {
              const darkL = Math.max(0, hsl.l - 10);
              const darkRgb = hslToRgb(hsl.h, hsl.s, darkL);
              const darkHex = rgbToHex(darkRgb.r, darkRgb.g, darkRgb.b);
              e.currentTarget.style.backgroundColor = darkHex;
              e.currentTarget.style.color = getThemeChromeForegroundHex(darkHex);
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = applyBaseBg;
              e.currentTarget.style.color = applyButtonFg;
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};
