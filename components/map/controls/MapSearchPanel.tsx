import React from 'react';
import { Search, X, Copy, Loader2 } from 'lucide-react';

export interface BorderSearchState {
  borderSearchQuery: string;
  setBorderSearchQuery: (q: string) => void;
  borderSearchMode: 'region' | 'place';
  setBorderSearchMode: (m: 'region' | 'place') => void;
  borderSearchResults: any[];
  borderSearchError: string | null;
  isSearchingBorder: boolean;
  handleBorderSearch: () => void;
  handleSelectBorder: (result: any) => void;
  handleCopyBorder: (geoJSON: any) => void;
}

interface MapSearchPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  themeColor: string;
  borderSearch: BorderSearchState;
  borderGeoJSON: any;
  onClearBorder: () => void;
  onClose: () => void;
}

export const MapSearchPanel: React.FC<MapSearchPanelProps> = ({
  isOpen,
  onToggle,
  themeColor,
  borderSearch,
  borderGeoJSON,
  onClearBorder,
  onClose
}) => {
  const {
    borderSearchQuery,
    setBorderSearchQuery,
    borderSearchMode,
    setBorderSearchMode,
    borderSearchResults,
    borderSearchError,
    isSearchingBorder,
    handleBorderSearch,
    handleSelectBorder,
    handleCopyBorder
  } = borderSearch;

  return (
  <div className="relative">
    <button
      onClick={onToggle}
      className={`bg-white p-2 sm:p-3 rounded-xl shadow-lg transition-all w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center ${
        isOpen ? 'text-white' : 'text-gray-700'
      } hover:scale-105 active:scale-95`}
      style={{ backgroundColor: isOpen ? themeColor : undefined }}
      title="Search Region or Place"
    >
      <Search size={18} className="sm:w-5 sm:h-5" />
    </button>

    {isOpen && (
      <div
        className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 z-[2000] animate-in fade-in slide-in-from-top-4"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-gray-800">Map Search</h3>
          <div className="flex items-center gap-2">
            {borderGeoJSON && (
              <>
                <button
                  onClick={() => handleCopyBorder(borderGeoJSON)}
                  className="p-1.5 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100 transition-colors border border-gray-100"
                  title="Copy Border GeoJSON"
                >
                  <Copy size={14} />
                </button>
                <button
                  onClick={onClearBorder}
                  className="text-[10px] font-bold px-2 py-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors border border-red-100"
                >
                  Clear Border
                </button>
              </>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex p-1 bg-gray-100 rounded-xl mb-4 relative overflow-hidden">
          <div
            className="absolute inset-y-1 rounded-lg bg-white shadow-sm transition-all duration-200"
            style={{
              width: 'calc(50% - 4px)',
              left: borderSearchMode === 'region' ? '4px' : 'calc(50%)'
            }}
          />
          <button
            onClick={() => setBorderSearchMode('region')}
            className={`flex-1 py-1.5 text-xs font-bold relative z-10 transition-colors ${
              borderSearchMode === 'region' ? 'text-gray-800' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Region Border
          </button>
          <button
            onClick={() => setBorderSearchMode('place')}
            className={`flex-1 py-1.5 text-xs font-bold relative z-10 transition-colors ${
              borderSearchMode === 'place' ? 'text-gray-800' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Place
          </button>
        </div>

        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <input
              autoFocus
              type="text"
              placeholder={borderSearchMode === 'region' ? 'Search region (e.g. London)' : 'Search place (e.g. Cafe)'}
              value={borderSearchQuery}
              onChange={(e) => setBorderSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleBorderSearch()}
              className="w-full pl-3 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            {isSearchingBorder && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <Loader2 size={14} className="animate-spin text-gray-400" />
              </div>
            )}
          </div>
          <button
            onClick={handleBorderSearch}
            disabled={isSearchingBorder || !borderSearchQuery.trim()}
            className="px-3 py-2 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50"
            style={{ backgroundColor: themeColor }}
          >
            Search
          </button>
        </div>

        {borderSearchError && (
          <div className="text-xs text-red-500 mb-3 px-1">{borderSearchError}</div>
        )}

        {borderSearchResults.length > 0 && (
          <div className="max-h-60 overflow-y-auto border-results-list pr-1">
            <style>{`
              .border-results-list::-webkit-scrollbar { width: 4px; }
              .border-results-list::-webkit-scrollbar-track { background: transparent; }
              .border-results-list::-webkit-scrollbar-thumb { background: ${themeColor}44; border-radius: 10px; }
              .border-results-list::-webkit-scrollbar-thumb:hover { background: ${themeColor}88; }
            `}</style>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">Select a region:</div>
            <div className="space-y-1">
              {borderSearchResults.map((result: any) => (
                <button
                  key={`${result.osm_type}-${result.osm_id}`}
                  onClick={() => handleSelectBorder(result)}
                  className="w-full text-left p-2.5 hover:bg-gray-50 rounded-xl transition-colors border border-transparent hover:border-gray-100 flex flex-col gap-0.5"
                >
                  <div className="text-sm font-medium text-gray-800 flex items-baseline gap-1 flex-wrap">
                    <span>{result.display_name.split(',')[0]}</span>
                    {(() => {
                      const addr = result.address;
                      const self = result.display_name.split(',')[0].trim();
                      const parts = result.display_name.split(',').map((p: string) => p.trim());
                      let parent = addr?.city || addr?.town || addr?.village ||
                        addr?.municipality || addr?.county ||
                        addr?.state_district || addr?.city_district ||
                        addr?.suburb || addr?.neighbourhood || addr?.state;
                      if (!parent || parent === self) {
                        parent = parts.find((p: string) =>
                          p !== self && !/^\d+$/.test(p) && p !== '中国' && p !== 'China'
                        );
                      }
                      if (parent && parent !== self) {
                        return (
                          <span className="text-xs text-gray-400 font-normal italic">, {parent}</span>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )}
  </div>
  );
};
