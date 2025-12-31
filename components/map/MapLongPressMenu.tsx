import React, { useRef, useEffect } from 'react';
import { Camera, Plus, MapPin } from 'lucide-react';

interface MapLongPressMenuProps {
  position: { x: number; y: number };
  coords: { lat: number; lng: number };
  onCreateNote: () => void;
  onImportFromCamera: () => void;
  onClose: () => void;
}

export const MapLongPressMenu: React.FC<MapLongPressMenuProps> = ({
  position,
  coords,
  onCreateNote,
  onImportFromCamera,
  onClose
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Close menu on escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-[3000] bg-white rounded-xl shadow-xl border border-gray-100 py-2 min-w-[200px]"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -100%)' // Center horizontally, position above the touch point
      }}
    >
      {/* Menu header with coordinates */}
      <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 rounded-t-xl">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <MapPin size={12} />
          <span>{coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}</span>
        </div>
      </div>

      {/* Menu items */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCreateNote();
          onClose();
        }}
        className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 flex items-center gap-3 text-gray-700 transition-colors"
      >
        <Plus size={16} className="text-gray-500" />
        <span>Create Note</span>
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onImportFromCamera();
          onClose();
        }}
        className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 flex items-center gap-3 text-gray-700 transition-colors"
      >
        <Camera size={16} className="text-gray-500" />
        <span>Import from Camera</span>
      </button>
    </div>
  );
};
