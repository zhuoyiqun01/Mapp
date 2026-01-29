import React, { useState, useMemo } from 'react';
import { Grid, List, Image as ImageIcon, MapPin, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Note, Project, Frame } from '../types';
import { parseNoteContent } from '../utils';

interface GalleryViewProps {
  project: Project;
  onSwitchToMapView: (coords?: { lat: number; lng: number }) => void;
  onSwitchToBoardView: () => void;
  themeColor: string;
}

interface GalleryItem {
  note: Note;
  frame: Frame | null;
}

export const GalleryView: React.FC<GalleryViewProps> = ({
  project,
  onSwitchToMapView,
  onSwitchToBoardView,
  themeColor
}) => {
  const [selectedFrame, setSelectedFrame] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedImage, setSelectedImage] = useState<GalleryItem | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // 获取所有包含图片和坐标的标准note，按frame分组
  const galleryData = useMemo(() => {
    const notes = project.notes.filter(note =>
      note.variant === 'standard' &&
      note.images && note.images.length > 0 &&
      note.coords
    );

    const frameMap = new Map(project.frames?.map(frame => [frame.id, frame]) || []);

    const items: GalleryItem[] = notes.map(note => ({
      note,
      frame: note.groupIds && note.groupIds.length > 0
        ? frameMap.get(note.groupIds[0]) || null
        : null
    }));

    // 按frame分组
    const groupedByFrame = new Map<string | null, GalleryItem[]>();
    items.forEach(item => {
      const frameId = item.frame?.id || null;
      if (!groupedByFrame.has(frameId)) {
        groupedByFrame.set(frameId, []);
      }
      groupedByFrame.get(frameId)!.push(item);
    });

    return groupedByFrame;
  }, [project.notes, project.frames]);

  const handleImageClick = (item: GalleryItem) => {
    setSelectedImage(item);
    setCurrentImageIndex(0);
  };

  const handleLocateOnMap = (coords: { lat: number; lng: number }) => {
    onSwitchToMapView(coords);
  };

  const getImageUrl = (note: Note): string => {
    if (note.images && note.images.length > 0) {
      // 优先使用Base64数据，否则尝试从IndexedDB加载
      if (note.images[0].startsWith('data:')) {
        return note.images[0];
      }
      // 这里可以添加从IndexedDB加载的逻辑
      return '/placeholder-image.png'; // 占位符
    }
    return '/placeholder-image.png';
  };

  return (
    <div className="h-full bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">Gallery</h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-lg transition-colors ${
              viewMode === 'grid'
                ? 'text-white'
                : 'hover:bg-gray-100 text-gray-600'
            }`}
            style={viewMode === 'grid' ? { backgroundColor: themeColor } : undefined}
            title="网格视图"
          >
            <Grid size={18} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-lg transition-colors ${
              viewMode === 'list'
                ? 'text-white'
                : 'hover:bg-gray-100 text-gray-600'
            }`}
            style={viewMode === 'list' ? { backgroundColor: themeColor } : undefined}
            title="列表视图"
          >
            <List size={18} />
          </button>
        </div>
      </div>

      {/* Frame Filter */}
      <div className="bg-white border-b border-gray-200 px-4 py-2">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedFrame(null)}
            className={`px-3 py-1 rounded-full text-sm transition-colors ${
              selectedFrame === null
                ? 'text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            style={selectedFrame === null ? { backgroundColor: themeColor } : undefined}
          >
            全部
          </button>
          {project.frames?.map(frame => (
            <button
              key={frame.id}
              onClick={() => setSelectedFrame(frame.id)}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                selectedFrame === frame.id
                  ? 'text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              style={selectedFrame === frame.id ? { backgroundColor: themeColor } : undefined}
            >
              {frame.title}
            </button>
          ))}
        </div>
      </div>

      {/* Gallery Content */}
      <div className="flex-1 overflow-auto p-4">
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {Array.from(galleryData.entries()).flatMap(([frameId, items]) => {
              if (selectedFrame !== null && frameId !== selectedFrame) return [];

              return items.map((item) => (
                <div
                  key={item.note.id}
                  className="relative group cursor-pointer"
                  onClick={() => handleImageClick(item)}
                >
                  <div className="aspect-square bg-gray-200 rounded-lg overflow-hidden">
                    <img
                      src={getImageUrl(item.note)}
                      alt={item.note.text || 'Note image'}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      loading="lazy"
                    />
                  </div>
                  <div className="absolute top-1 right-1 bg-black bg-opacity-50 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <MapPin size={12} className="text-white" />
                  </div>
                  {/* Label indicator */}
                  {item.note.text && (
                    <div className="absolute bottom-1 left-1 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded max-w-[90%] truncate">
                      {parseNoteContent(item.note.text).title}
                    </div>
                  )}
                </div>
              ));
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from(galleryData.entries()).flatMap(([frameId, items]) => {
              if (selectedFrame !== null && frameId !== selectedFrame) return [];

              return items.map((item) => (
                <div
                  key={item.note.id}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => handleImageClick(item)}
                >
                  <div className="aspect-video bg-gray-200 relative">
                    <img
                      src={getImageUrl(item.note)}
                      alt={item.note.text || 'Note image'}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {/* Label indicator */}
                    {item.note.text && (
                      <div className="absolute bottom-1 left-1 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded max-w-[90%] truncate">
                        {parseNoteContent(item.note.text).title}
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm text-gray-700 line-clamp-2">
                      {item.note.text || '无描述'}
                    </p>
                  </div>
                </div>
              ));
            })}
          </div>
        )}
      </div>

      {/* Image Preview Modal */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200" onClick={() => setSelectedImage(null)}>
          <div 
            className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header style similar to Mapping Preview Panel */}
            <div className="p-4 pb-2 flex items-start justify-between gap-3 border-b border-gray-100">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                {selectedImage.note.emoji && (
                  <span className="text-2xl mt-0.5 shrink-0">{selectedImage.note.emoji}</span>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-bold text-gray-900 leading-tight line-clamp-2 break-words">
                    {parseNoteContent(selectedImage.note.text || '').title || 'Untitled Note'}
                  </h3>
                </div>
              </div>
              <button
                onClick={() => setSelectedImage(null)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors shrink-0"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            {/* Large Image with Navigation */}
            {(() => {
              const allImages = [...(selectedImage.note.images || [])];
              if (selectedImage.note.sketch) allImages.push(selectedImage.note.sketch);
              
              if (allImages.length === 0) return null;

              return (
                <div className="relative group aspect-[4/3] bg-gray-100 flex items-center justify-center">
                  <img
                    src={allImages[currentImageIndex]}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                  
                  {/* Navigation Arrows */}
                  {allImages.length > 1 && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentImageIndex(prev => (prev - 1 + allImages.length) % allImages.length);
                        }}
                        className="absolute left-4 p-2 bg-black/30 hover:bg-black/50 text-white rounded-full transition-colors backdrop-blur-sm"
                      >
                        <ChevronLeft size={24} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentImageIndex(prev => (prev + 1) % allImages.length);
                        }}
                        className="absolute right-4 p-2 bg-black/30 hover:bg-black/50 text-white rounded-full transition-colors backdrop-blur-sm"
                      >
                        <ChevronRight size={24} />
                      </button>
                      
                      {/* Indicator dots */}
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 px-3 py-1.5 bg-black/20 backdrop-blur-md rounded-full">
                        {allImages.map((_, idx) => (
                          <div
                            key={idx}
                            className={`w-1.5 h-1.5 rounded-full transition-all ${
                              idx === currentImageIndex ? 'bg-white w-3' : 'bg-white/40'
                            }`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
