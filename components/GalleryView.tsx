import React, { useState, useMemo } from 'react';
import { ChevronLeft, Grid, List, Image as ImageIcon, MapPin, X } from 'lucide-react';
import { Note, Project, Frame } from '../types';

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
          <button
            onClick={onSwitchToBoardView}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            title="返回Board视图"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-xl font-semibold text-gray-900">Gallery</h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-lg transition-colors ${
              viewMode === 'grid'
                ? 'bg-blue-100 text-blue-600'
                : 'hover:bg-gray-100 text-gray-600'
            }`}
            title="网格视图"
          >
            <Grid size={18} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-lg transition-colors ${
              viewMode === 'list'
                ? 'bg-blue-100 text-blue-600'
                : 'hover:bg-gray-100 text-gray-600'
            }`}
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
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            全部
          </button>
          {project.frames?.map(frame => (
            <button
              key={frame.id}
              onClick={() => setSelectedFrame(frame.id)}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                selectedFrame === frame.id
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {frame.title}
            </button>
          ))}
        </div>
      </div>

      {/* Gallery Content */}
      <div className="flex-1 overflow-auto p-4">
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from(galleryData.entries()).map(([frameId, items]) => {
              if (selectedFrame !== null && frameId !== selectedFrame) return null;

              const frame = frameId ? project.frames?.find(f => f.id === frameId) : null;

              return (
                <div key={frameId || 'no-frame'} className="space-y-3">
                  {frame && (
                    <h3 className="text-lg font-medium text-gray-900 px-2">
                      {frame.title}
                    </h3>
                  )}
                  {!frame && selectedFrame === null && (
                    <h3 className="text-lg font-medium text-gray-900 px-2">
                      未分组
                    </h3>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    {items.map((item) => (
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
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(galleryData.entries()).map(([frameId, items]) => {
              if (selectedFrame !== null && frameId !== selectedFrame) return null;

              const frame = frameId ? project.frames?.find(f => f.id === frameId) : null;

              return (
                <div key={frameId || 'no-frame'} className="space-y-3">
                  {frame && (
                    <h3 className="text-lg font-medium text-gray-900">
                      {frame.title}
                    </h3>
                  )}
                  {!frame && selectedFrame === null && (
                    <h3 className="text-lg font-medium text-gray-900">
                      未分组
                    </h3>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {items.map((item) => (
                      <div
                        key={item.note.id}
                        className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => handleImageClick(item)}
                      >
                        <div className="aspect-video bg-gray-200">
                          <img
                            src={getImageUrl(item.note)}
                            alt={item.note.text || 'Note image'}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        <div className="p-3">
                          <p className="text-sm text-gray-700 line-clamp-2">
                            {item.note.text || '无描述'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Image Preview Modal */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                {selectedImage.frame && (
                  <span className="text-sm text-gray-600">
                    {selectedImage.frame.title}
                  </span>
                )}
                <span className="text-sm text-gray-400">•</span>
                <span className="text-sm text-gray-600">
                  {selectedImage.note.text || '无标题'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleLocateOnMap(selectedImage.note.coords)}
                  className="flex items-center gap-1 px-3 py-1 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
                >
                  <MapPin size={14} />
                  定位到地图
                </button>
                <button
                  onClick={() => setSelectedImage(null)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="p-4">
              <img
                src={getImageUrl(selectedImage.note)}
                alt={selectedImage.note.text || 'Note image'}
                className="w-full h-auto max-h-[60vh] object-contain"
              />
              {selectedImage.note.text && (
                <p className="mt-4 text-gray-700">
                  {selectedImage.note.text}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
