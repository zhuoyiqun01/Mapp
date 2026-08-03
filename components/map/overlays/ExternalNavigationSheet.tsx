import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import {
  listExternalMapApps,
  openExternalMapApp,
  type ExternalMapAppId
} from '../../utils/map/openExternalNavigation';

type Props = {
  open: boolean;
  lat: number;
  lng: number;
  label?: string;
  onClose: () => void;
  themeColor?: string;
};

/**
 * 选择用地图 App 打开导航（移动端接近系统「用何应用打开」；
 * Android 选「系统地图」即弹出系统选择器）。
 */
export const ExternalNavigationSheet: React.FC<Props> = ({
  open,
  lat,
  lng,
  label,
  onClose,
  themeColor = '#3b82f6'
}) => {
  if (!open || typeof document === 'undefined') return null;

  const apps = listExternalMapApps();

  const pick = (id: ExternalMapAppId) => {
    openExternalMapApp(id, lat, lng, { label });
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="选择地图应用"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40 border-0 cursor-default"
        aria-label="关闭"
        onClick={onClose}
      />
      <div
        className="relative w-full sm:max-w-sm sm:mx-4 rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl border border-gray-100/80 overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div>
            <div className="text-base font-bold text-gray-900">导航到此点</div>
            <div className="text-[11px] text-gray-400 mt-0.5">选择用地图应用打开</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 border-0"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>
        <ul className="px-2 pb-2">
          {apps.map((app) => (
            <li key={app.id}>
              <button
                type="button"
                onClick={() => pick(app.id)}
                className="w-full text-left px-3 py-3 rounded-xl hover:bg-gray-50 border-0 flex flex-col gap-0.5"
              >
                <span className="text-sm font-semibold text-gray-800">{app.label}</span>
                {app.hint ? (
                  <span className="text-[11px] text-gray-400 leading-snug">{app.hint}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
        <div className="px-4 pb-4 pt-1 safe-area-pb">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-bold text-theme-chrome-fg border-0"
            style={{ backgroundColor: themeColor }}
          >
            取消
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
