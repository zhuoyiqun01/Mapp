
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, ImageOverlay, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Note, Coordinates, Project } from '../types';
import { MAP_TILE_URL, MAP_TILE_URL_FALLBACK, MAP_SATELLITE_URL, MAP_ATTRIBUTION } from '../constants';
import { Search, Locate, Loader2, X, Check, Satellite, ArrowRight, Plus } from 'lucide-react';
import exifr from 'exifr';
import { NoteEditor } from './NoteEditor';
import { generateId } from '../utils';
import { ZoomSlider } from './ZoomSlider';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface MapViewProps {
  project: Project;
  onAddNote: (note: Note) => void;
  onUpdateNote: (note: Note) => void;
  onDeleteNote?: (noteId: string) => void;
  onToggleEditor: (isOpen: boolean) => void;
}

const MapLongPressHandler = ({ onLongPress }: { onLongPress: (coords: Coordinates) => void }) => {
  const map = useMap();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number, y: number } | null>(null);
  const touchCountRef = useRef<number>(0);
  
  // 检查目标元素是否是 UI 元素或标记
  const isUIElement = (target: EventTarget | null): boolean => {
    if (!target || !(target instanceof Element)) return false;
    
    const element = target as HTMLElement;
    
    // 检查是否是 Leaflet 标记元素
    if (element.classList.contains('leaflet-marker-icon') || 
        element.closest('.leaflet-marker-icon') ||
        element.classList.contains('custom-icon') ||
        element.closest('.custom-icon')) {
      return true;
    }
    
    // 检查是否是交互元素（button, input, select, textarea 等）
    const interactiveTags = ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A'];
    if (interactiveTags.includes(element.tagName)) {
      return true;
    }
    
    // 检查是否在 UI 容器内（通过检查 z-index 或特定的类名）
    let current: HTMLElement | null = element;
    while (current) {
      // 检查是否有 pointer-events-auto 类（UI 元素通常有这个类）
      if (current.classList.contains('pointer-events-auto')) {
        return true;
      }
      
      // 检查是否在高 z-index 的容器内（UI 元素通常在 z-[400] 或 z-[500] 的容器内）
      const zIndex = window.getComputedStyle(current).zIndex;
      if (zIndex && (zIndex === '400' || zIndex === '500' || parseInt(zIndex) >= 400)) {
        return true;
      }
      
      // 检查是否在特定的容器内
      if (current.id === 'map-view-container' && current !== element) {
        // 如果已经到达 map-view-container，说明不在 UI 层
        break;
      }
      
      current = current.parentElement;
    }
    
    return false;
  };
  
  useEffect(() => {
    const container = map.getContainer();

    const handleStart = (e: TouchEvent | MouseEvent) => {
      if (e instanceof MouseEvent && e.button !== 0) return;
      
      // 检查是否点击在 UI 元素上
      if (isUIElement(e.target)) {
        return;
      }
      
      // 清除任何已存在的计时器
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      
      // 如果是多指触摸（双指缩放），不启动长按计时器
      if ('touches' in e) {
        touchCountRef.current = e.touches.length;
        if (e.touches.length > 1) {
          startPosRef.current = null;
          return;
        }
      } else {
        touchCountRef.current = 1;
      }
      
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      startPosRef.current = { x: clientX, y: clientY };

      timerRef.current = setTimeout(() => {
        // 再次检查触摸点数量，防止在等待期间变成多指
        if (touchCountRef.current > 1) {
          timerRef.current = null;
          startPosRef.current = null;
          return;
        }
        
        // 再次检查是否在 UI 元素上（防止在等待期间鼠标移动到 UI 元素上）
        if (document.elementFromPoint(clientX, clientY) && isUIElement(document.elementFromPoint(clientX, clientY))) {
          timerRef.current = null;
          startPosRef.current = null;
          return;
        }
        
        const rect = container.getBoundingClientRect();
        const relativeX = clientX - rect.left;
        const relativeY = clientY - rect.top;
        const latlng = map.containerPointToLatLng([relativeX, relativeY]);
        if (navigator.vibrate) navigator.vibrate(50);
        onLongPress(latlng);
        startPosRef.current = null;
        timerRef.current = null;
      }, 600); 
    };

    const handleMove = (e: TouchEvent | MouseEvent) => {
       if (!startPosRef.current || !timerRef.current) return;
       
       // 更新触摸点数量
       if ('touches' in e) {
         touchCountRef.current = e.touches.length;
       }
       
       // 如果变成多指触摸（双指缩放），取消长按计时器
       if ('touches' in e && e.touches.length > 1) {
         clearTimeout(timerRef.current);
         timerRef.current = null;
         startPosRef.current = null;
         return;
       }
       
       const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
       const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
       
       // 检查是否移动到 UI 元素上
       if (isUIElement(e.target) || (document.elementFromPoint(clientX, clientY) && isUIElement(document.elementFromPoint(clientX, clientY)))) {
         clearTimeout(timerRef.current);
         timerRef.current = null;
         startPosRef.current = null;
         return;
       }
       
       const dx = clientX - startPosRef.current.x;
       const dy = clientY - startPosRef.current.y;
       const dist = Math.sqrt(dx*dx + dy*dy);
       if (dist > 10) {
         clearTimeout(timerRef.current);
         timerRef.current = null;
         startPosRef.current = null;
       }
    };

    const handleEnd = (e?: TouchEvent | MouseEvent) => {
       // 更新触摸点数量
       if (e && 'touches' in e) {
         touchCountRef.current = e.touches.length;
       } else {
         touchCountRef.current = 0;
       }
       
       // 如果点击在标记上，不要清除计时器（让标记的点击事件处理）
       if (e && isUIElement(e.target)) {
         // 标记点击，不处理长按逻辑
         if (timerRef.current) {
           clearTimeout(timerRef.current);
           timerRef.current = null;
         }
         startPosRef.current = null;
         return;
       }
       
       if (timerRef.current) {
         clearTimeout(timerRef.current);
         timerRef.current = null;
       }
       startPosRef.current = null;
    };

    container.addEventListener('touchstart', handleStart, { passive: true });
    container.addEventListener('mousedown', handleStart);
    container.addEventListener('touchmove', handleMove, { passive: true });
    container.addEventListener('mousemove', handleMove);
    container.addEventListener('touchend', (e) => handleEnd(e));
    container.addEventListener('mouseup', handleEnd);

    return () => {
      container.removeEventListener('touchstart', handleStart);
      container.removeEventListener('mousedown', handleStart);
      container.removeEventListener('touchmove', handleMove);
      container.removeEventListener('mousemove', handleMove);
      container.removeEventListener('touchend', handleEnd);
      container.removeEventListener('mouseup', handleEnd);
    };
  }, [map, onLongPress]);

  return null;
};

const MapControls = ({ onImportClick, mapStyle, onMapStyleChange, onNextPin }: { 
    onImportClick: () => void;
    mapStyle: 'standard' | 'satellite';
    onMapStyleChange: (style: 'standard' | 'satellite') => void;
    onNextPin: () => void;
}) => {
    const map = useMap();
    const locate = () => {
        map.locate().on("locationfound", function (e) {
            map.flyTo(e.latlng, 16);
        });
    };
    return (
        <div 
            className="flex flex-col gap-2 pointer-events-auto"
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
        >
            <button 
                onClick={(e) => { e.stopPropagation(); locate(); }}
                className="bg-white p-3 rounded-xl shadow-lg hover:bg-yellow-50 text-gray-700 transition-colors"
                title="Locate Me"
            >
                <Locate size={20} />
            </button>
            <button 
                onClick={(e) => { 
                    e.stopPropagation(); 
                    onMapStyleChange(mapStyle === 'standard' ? 'satellite' : 'standard');
                }}
                className={`p-3 rounded-xl shadow-lg transition-colors ${
                    mapStyle === 'satellite' 
                        ? 'bg-[#FFDD00] text-gray-900' 
                        : 'bg-white hover:bg-yellow-50 text-gray-700'
                }`}
                title={mapStyle === 'standard' ? 'Switch to Satellite' : 'Switch to Standard'}
            >
                <Satellite size={20} />
            </button>
            <button 
                onClick={(e) => { e.stopPropagation(); onNextPin(); }}
                className="bg-white p-3 rounded-xl shadow-lg hover:bg-yellow-50 text-gray-700 transition-colors"
                title="Next Pin"
            >
                <ArrowRight size={20} />
            </button>
            <button 
                onClick={(e) => { e.stopPropagation(); onImportClick(); }}
                className="bg-white p-3 rounded-xl shadow-lg hover:bg-yellow-50 text-gray-700 transition-colors"
                title="Import Photos"
            >
                <Plus size={20} />
            </button>
        </div>
    );
}

const MapZoomController = ({min, max, step = 1}: {min: number, max: number, step?: number}) => {
    const map = useMap();
    const [zoom, setZoom] = useState(map.getZoom());
    useMapEvents({
        zoomend: () => setZoom(map.getZoom())
    });
    return (
      <ZoomSlider value={zoom} min={min} max={max} step={step} onChange={(val) => map.setZoom(val)} />
    );
};

// 确保地图在初始化后正确居中（仅执行一次）
const MapCenterHandler = ({ center, zoom }: { center: [number, number], zoom: number }) => {
    const map = useMap();
    const hasCenteredRef = useRef(false);
    
    useEffect(() => {
        // 只在首次初始化时执行一次
        if (hasCenteredRef.current || !map) return;
        
        // 等待地图完全初始化后再设置视图
        map.whenReady(() => {
            if (hasCenteredRef.current) return;
            
            // 使用 invalidateSize 确保地图尺寸正确
            map.invalidateSize();
            // 使用 setTimeout 确保在下一个事件循环中执行，此时容器尺寸应该已经正确
            setTimeout(() => {
                if (!hasCenteredRef.current) {
                    map.invalidateSize();
                    // 重新设置视图以确保居中（仅首次）
                    map.setView(center, zoom, { animate: false });
                    hasCenteredRef.current = true;
                }
            }, 0);
        });
    }, []); // 空依赖数组，只在组件挂载时执行一次
    
    return null;
};

export const MapView: React.FC<MapViewProps> = ({ project, onAddNote, onUpdateNote, onDeleteNote, onToggleEditor }) => {
  const notes = project.notes;
  const [editingNote, setEditingNote] = useState<Partial<Note> | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  
  const [imageDimensions, setImageDimensions] = useState<[number, number] | null>(null);
  const [minImageZoom, setMinImageZoom] = useState(-20);
  
  // 标记聚合相关状态
  const [clusteredMarkers, setClusteredMarkers] = useState<Array<{ notes: Note[], position: [number, number] }>>([]);
  const [currentNoteIndex, setCurrentNoteIndex] = useState(0);
  const [currentClusterNotes, setCurrentClusterNotes] = useState<Note[]>([]);
  
  // 图片导入相关状态
  const [importPreview, setImportPreview] = useState<Array<{
    file: File;
    imageUrl: string;
    lat: number;
    lng: number;
    error?: string;
  }>>([]);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 地图风格状态
  const [mapStyle, setMapStyle] = useState<'standard' | 'satellite'>('standard');
  
  // 当前查看的标记索引
  const [currentPinIndex, setCurrentPinIndex] = useState(0);

  const defaultCenter: [number, number] = [28.1847, 112.9467];
  const isMapMode = project.type === 'map';
  const mapNotes = useMemo(() => 
    notes.filter(n => n.variant === 'standard' || !n.variant),
    [notes]
  );

  // Load Image Dimensions and persistence
  useEffect(() => {
    if (project.type === 'image' && project.backgroundImage) {
        // Reset only if ID changes to prevent flicker
        const img = new Image();
        img.src = project.backgroundImage;
        img.onload = () => {
            setImageDimensions([img.naturalHeight, img.naturalWidth]);
        };
    } else {
        setImageDimensions(null);
    }
  }, [project.id, project.type, project.backgroundImage]);

  // Calculate dynamic min zoom for image
  useEffect(() => {
    if (project.type === 'image' && mapInstance && imageDimensions) {
        const bounds = L.latLngBounds([0,0], imageDimensions);
        // "inside=true" means fit the bounds inside the view
        const fitZoom = mapInstance.getBoundsZoom(bounds, true);
        
        setMinImageZoom(fitZoom);
        mapInstance.setMinZoom(fitZoom);
        
        // Initially fit bounds if first load or logic dictates
        mapInstance.fitBounds(bounds);
    }
  }, [mapInstance, imageDimensions, project.type]);

  const imageBounds: L.LatLngBoundsExpression = imageDimensions 
      ? [[0, 0], imageDimensions] 
      : [[0, 0], [1000, 1000]];

  const handleLongPress = (coords: Coordinates) => {
    let nextBoardX = 20 + (Math.random() * 30);
    let nextBoardY = 20 + (Math.random() * 30);

    if (notes.length > 0) {
        const lastNote = [...notes].sort((a, b) => b.createdAt - a.createdAt)[0];
        if (lastNote) {
            nextBoardX = lastNote.boardX + 30;
            nextBoardY = lastNote.boardY + 30;
            if (nextBoardX > 400) nextBoardX = 50;
            if (nextBoardY > 400) nextBoardY = 50;
        }
    }

    const newNote: Partial<Note> = {
      id: generateId(),
      createdAt: Date.now(),
      coords: coords,
      fontSize: 3, 
      boardX: nextBoardX,
      boardY: nextBoardY,
      variant: 'standard',
      color: '#FFFDF5'
    };
    setEditingNote(newNote);
    setIsEditorOpen(true);
    onToggleEditor(true);
  };

  const handleMarkerClick = (note: Note) => {
    // 点击标记时，总是编辑传入的note（聚合标记传入的是最下面那个）
    console.log('Marker clicked:', note.id);
    setCurrentClusterNotes([]);
    setCurrentNoteIndex(0);
    setEditingNote(note);
    setIsEditorOpen(true);
    onToggleEditor(true);
  };

  // 移动到下一个pin
  const moveToNextPin = () => {
    if (!mapInstance || mapNotes.length === 0) return;
    
    // 如果当前索引超出范围，重置为0
    if (currentPinIndex >= mapNotes.length) {
      setCurrentPinIndex(0);
    }
    
    const nextIndex = (currentPinIndex + 1) % mapNotes.length;
    const nextNote = mapNotes[nextIndex];
    
    if (nextNote) {
      mapInstance.flyTo([nextNote.coords.lat, nextNote.coords.lng], 16, { duration: 1.5 });
      setCurrentPinIndex(nextIndex);
    }
  };
  
  // 切换到下一个标记（右滑）
  const switchToNextNote = () => {
    if (currentClusterNotes.length > 1 && currentNoteIndex < currentClusterNotes.length - 1) {
      const nextIndex = currentNoteIndex + 1;
      setCurrentNoteIndex(nextIndex);
      setEditingNote(currentClusterNotes[nextIndex]);
    }
  };
  
  // 切换到上一个标记（左滑）
  const switchToPrevNote = () => {
    if (currentClusterNotes.length > 1 && currentNoteIndex > 0) {
      const prevIndex = currentNoteIndex - 1;
      setCurrentNoteIndex(prevIndex);
      setEditingNote(currentClusterNotes[prevIndex]);
    }
  };

  const handleSaveNote = (noteData: Partial<Note>) => {
    if (noteData.id && notes.some(n => n.id === noteData.id)) {
        onUpdateNote(noteData as Note);
    } else {
        onAddNote(noteData as Note);
    }
  };

  const closeEditor = () => {
      setIsEditorOpen(false);
      onToggleEditor(false);
  };

  // 处理图片导入
  const handleImageImport = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const fileArray = Array.from(files).slice(0, 9); // 最多9张
    const previews: Array<{
      file: File;
      imageUrl: string;
      lat: number;
      lng: number;
      error?: string;
    }> = [];
    
    for (const file of fileArray) {
      try {
        // 读取EXIF数据
        const exifData = await exifr.parse(file, {
          gps: true,
          translateKeys: false,
          translateValues: false,
          reviveValues: true
        });
        
        if (!exifData || !exifData.latitude || !exifData.longitude) {
          previews.push({
            file,
            imageUrl: URL.createObjectURL(file),
            lat: 0,
            lng: 0,
            error: '缺少位置信息'
          });
          continue;
        }
        
        previews.push({
          file,
          imageUrl: URL.createObjectURL(file),
          lat: exifData.latitude,
          lng: exifData.longitude
        });
      } catch (error) {
        previews.push({
          file,
          imageUrl: URL.createObjectURL(file),
          lat: 0,
          lng: 0,
          error: '无法读取图片或位置信息'
        });
      }
    }
    
    setImportPreview(previews);
    setShowImportDialog(true);
    
    // 如果有有效的位置信息，飞到此位置
    const validPreviews = previews.filter(p => !p.error);
    if (validPreviews.length > 0 && mapInstance) {
      const firstValid = validPreviews[0];
      mapInstance.flyTo([firstValid.lat, firstValid.lng], 16, { duration: 1.5 });
    }
  };

  // 确认导入
  const handleConfirmImport = async () => {
    const validPreviews = importPreview.filter(p => !p.error);
    
    for (const preview of validPreviews) {
      try {
        // 将图片转换为base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(preview.file);
        });
        
        // 创建新的note
        const newNote: Note = {
          id: generateId(),
          text: '',
          coords: {
            lat: preview.lat,
            lng: preview.lng
          },
          images: [base64],
          createdAt: Date.now(),
          variant: 'standard',
          emoji: '',
          tags: [],
          fontSize: 3,
          boardX: 0,
          boardY: 0,
          groupName: undefined,
          groupId: undefined
        };
        
        onAddNote(newNote);
      } catch (error) {
        console.error('导入图片失败:', error);
      }
    }
    
    // 清理预览
    importPreview.forEach(p => URL.revokeObjectURL(p.imageUrl));
    setImportPreview([]);
    setShowImportDialog(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 取消导入
  const handleCancelImport = () => {
    importPreview.forEach(p => URL.revokeObjectURL(p.imageUrl));
    setImportPreview([]);
    setShowImportDialog(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (!searchQuery.trim()) {
          setSearchResults([]);
          return;
      }
      setIsSearching(true);
      searchTimeoutRef.current = setTimeout(async () => {
          try {
             const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5&addressdetails=1`);
             if (response.ok) {
                 const data = await response.json();
                 setSearchResults(data);
             }
          } catch (e) {
             console.error(e);
          } finally {
             setIsSearching(false);
          }
      }, 500); 
      return () => {
          if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      };
  }, [searchQuery]);

  const selectSearchResult = (result: any) => {
      if (mapInstance) {
          const lat = parseFloat(result.lat);
          const lon = parseFloat(result.lon);
          mapInstance.flyTo([lat, lon], 16, { duration: 1.5 });
          setSearchQuery('');
          setSearchResults([]);
      }
  };

  const createCustomIcon = (note: Note, count?: number) => {
      const countBadge = count && count > 1 ? `
        <div style="
          position: absolute;
          top: -8px;
          right: -8px;
          width: 20px;
          height: 20px;
          background-color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          z-index: 10;
          border: 2px solid #FFDD00;
        ">
          <span style="
            color: #FFDD00;
            font-size: 12px;
            font-weight: bold;
            line-height: 1;
          ">${count}</span>
        </div>
      ` : '';
      
      // 优先级：照片 > 涂鸦 > emoji，都没有则纯黄色
      let content = '';
      let backgroundColor = 'white';
      
      if (note.images && note.images.length > 0) {
        // 显示照片，更大以撑满pin
        content = `<img src="${note.images[0]}" style="
          width: 36px;
          height: 36px;
          border-radius: 50%;
          object-fit: cover;
          transform: rotate(45deg);
        " />`;
      } else if (note.sketch) {
        // 显示涂鸦，更大以撑满pin
        content = `<img src="${note.sketch}" style="
          width: 36px;
          height: 36px;
          border-radius: 50%;
          object-fit: cover;
          transform: rotate(45deg);
        " />`;
      } else if (note.emoji) {
        // 显示emoji，背景为黄色
        backgroundColor = '#FFDD00';
        content = `<span style="transform: rotate(45deg); font-size: 20px; line-height: 1;">${note.emoji}</span>`;
      } else {
        // 都没有，显示纯黄色
        backgroundColor = '#FFDD00';
      }
      
      return L.divIcon({
          className: 'custom-icon',
          html: `<div style="
            position: relative;
            background-color: ${backgroundColor}; 
            width: 40px; 
            height: 40px; 
            border-radius: 50% 50% 50% 0; 
            transform: rotate(-45deg);
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
            border: 3px solid #FFDD00;
            overflow: hidden;
          ">
            ${content}
          </div>
          ${countBadge}`,
          iconSize: [40, 40],
          iconAnchor: [20, 40],
          popupAnchor: [0, -40]
      });
  };
  
  // 对标记进行排序：从下往上、从左往右
  const sortNotes = useCallback((notes: Note[]): Note[] => {
    return [...notes].sort((a, b) => {
      // 先按纬度（从下往上，纬度小的在下）
      if (Math.abs(a.coords.lat - b.coords.lat) > 0.0001) {
        return a.coords.lat - b.coords.lat;
      }
      // 再按经度（从左往右，经度小的在左）
      return a.coords.lng - b.coords.lng;
    });
  }, []);
  
  // 检测标记是否重叠（基于屏幕像素距离）
  const detectClusters = useCallback((notes: Note[], map: L.Map, threshold: number = 50): Array<{ notes: Note[], position: [number, number] }> => {
    if (!map || notes.length === 0) return [];
    
    // 检查地图是否已经初始化
    try {
      // 尝试获取地图容器，如果失败说明地图还没准备好
      const container = map.getContainer();
      if (!container || !container.offsetParent) {
        return [];
      }
    } catch (e) {
      return [];
    }
    
    const sortedNotes = sortNotes(notes);
    const clusters: Array<{ notes: Note[], position: [number, number] }> = [];
    const processed = new Set<string>();
    
    sortedNotes.forEach((note) => {
      if (processed.has(note.id)) return;
      
      try {
        const notePoint = map.latLngToContainerPoint([note.coords.lat, note.coords.lng]);
        const cluster: Note[] = [note];
        processed.add(note.id);
        
        // 查找附近的标记
        sortedNotes.forEach((otherNote) => {
          if (processed.has(otherNote.id)) return;
          
          try {
            const otherPoint = map.latLngToContainerPoint([otherNote.coords.lat, otherNote.coords.lng]);
            const distance = notePoint.distanceTo(otherPoint);
            
            if (distance < threshold) {
              cluster.push(otherNote);
              processed.add(otherNote.id);
            }
          } catch (e) {
            // 如果转换失败，跳过这个标记
            console.warn('Failed to convert note to container point:', e);
          }
        });
        
        // 使用最下方的标记位置（排序后的第一个）
        const clusterNotes = sortNotes(cluster);
        const bottomNote = clusterNotes[0];
        clusters.push({
          notes: clusterNotes,
          position: [bottomNote.coords.lat, bottomNote.coords.lng]
        });
      } catch (e) {
        // 如果转换失败，跳过这个标记
        console.warn('Failed to convert note to container point:', e);
      }
    });
    
    return clusters;
  }, [sortNotes]);
  
  // 更新聚合标记
  useEffect(() => {
    if (!isMapMode || !mapInstance || mapNotes.length === 0) {
      setClusteredMarkers([]);
      return;
    }
    
    const updateClusters = () => {
      if (!mapInstance) return;
      
      // 确保地图已经准备好
      mapInstance.whenReady(() => {
        try {
          const clusters = detectClusters(mapNotes, mapInstance);
          setClusteredMarkers(clusters);
        } catch (e) {
          console.warn('Failed to update clusters:', e);
        }
      });
    };
    
    // 延迟执行，确保地图完全初始化
    const timeoutId = setTimeout(() => {
      updateClusters();
    }, 100);
    
    // 监听地图缩放和移动事件
    mapInstance.on('zoomend', updateClusters);
    mapInstance.on('moveend', updateClusters);
    
    return () => {
      clearTimeout(timeoutId);
      if (mapInstance) {
        mapInstance.off('zoomend', updateClusters);
        mapInstance.off('moveend', updateClusters);
      }
    };
  }, [mapInstance, mapNotes, isMapMode, detectClusters]);

  return (
    <div id="map-view-container" className="relative w-full h-full z-0 bg-gray-100">
      <MapContainer 
        key={project.id} 
        center={isMapMode ? defaultCenter : [0, 0]} 
        zoom={isMapMode ? 16 : -8}
        minZoom={isMapMode ? 13 : -20} 
        maxZoom={isMapMode ? 19 : 2}
        crs={isMapMode ? L.CRS.EPSG3857 : L.CRS.Simple}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        ref={setMapInstance}
        doubleClickZoom={false}
      >
        {isMapMode ? (
           <TileLayer 
             attribution={MAP_ATTRIBUTION} 
             url={mapStyle === 'satellite' ? MAP_SATELLITE_URL : MAP_TILE_URL}
             maxNativeZoom={19}
             maxZoom={19}
           />
        ) : (
           <>
              {project.backgroundImage && imageDimensions && (
                  <ImageOverlay
                    url={project.backgroundImage}
                    bounds={imageBounds}
                  />
              )}
           </>
        )}
        
        <MapLongPressHandler onLongPress={handleLongPress} />
        
        {isMapMode && (
          <MapCenterHandler center={defaultCenter} zoom={16} />
        )}
        
        {isMapMode && clusteredMarkers.length > 0 ? (
          // 显示聚合标记（只显示有多个标记的聚合，单个标记单独显示）
          clusteredMarkers.map((cluster, index) => {
            if (cluster.notes.length === 1) {
              // 单个标记，直接显示
              const note = cluster.notes[0];
              return (
                <Marker 
                  key={note.id}
                  position={[note.coords.lat, note.coords.lng]}
                  icon={createCustomIcon(note)}
                  eventHandlers={{ 
                    click: () => {
                      handleMarkerClick(note);
                    }
                  }}
                />
              );
            } else {
              // 多个标记，显示聚合
              return (
                <Marker 
                  key={`cluster-${index}`}
                  position={cluster.position}
                  icon={createCustomIcon(cluster.notes[0], cluster.notes.length)}
                  eventHandlers={{ 
                    click: () => {
                      handleMarkerClick(cluster.notes[0]);
                    }
                  }}
                />
              );
            }
          })
        ) : (
          // 显示单个标记（非地图模式或没有聚合时）
          mapNotes.map(note => (
            <Marker 
              key={note.id} 
              position={[note.coords.lat, note.coords.lng]}
              icon={createCustomIcon(note)}
              eventHandlers={{ 
                click: () => {
                  handleMarkerClick(note);
                }
              }}
            />
          ))
        )}

        {/* 导入预览标记 */}
        {isMapMode && showImportDialog && importPreview.filter(p => !p.error).map((preview, index) => (
          <Marker
            key={`preview-${index}`}
            position={[preview.lat, preview.lng]}
            icon={L.divIcon({
              className: 'custom-icon preview-marker',
              html: `<div style="
                position: relative;
                background-color: #FFDD00; 
                width: 40px; 
                height: 40px; 
                border-radius: 50% 50% 50% 0; 
                transform: rotate(-45deg);
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
                border: 3px solid #FFDD00;
                overflow: hidden;
                opacity: 0.7;
              ">
                <img src="${preview.imageUrl}" style="
                  width: 36px;
                  height: 36px;
                  border-radius: 50%;
                  object-fit: cover;
                  transform: rotate(45deg);
                " />
              </div>`,
              iconSize: [40, 40],
              iconAnchor: [20, 40]
            })}
          />
        ))}

        {isMapMode && (
          <div className="absolute top-4 left-4 right-4 z-[500] flex gap-2 pointer-events-none items-start">
              <div 
                  className="flex-1 max-w-md relative group pointer-events-auto"
                  onPointerDown={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
              >
                  <div className="bg-white rounded-xl shadow-lg flex items-center px-4 transition-shadow focus-within:shadow-xl relative z-10">
                      <Search size={18} className="text-gray-400 flex-shrink-0" />
                      <input 
                          type="text" 
                          placeholder="Search city, place..." 
                          className="w-full p-3 bg-transparent border-none outline-none text-gray-700 placeholder-gray-400"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                      />
                      {isSearching && <Loader2 size={18} className="text-yellow-500 animate-spin" />}
                  </div>
                  {searchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 border border-gray-100">
                          {searchResults.map((result: any, i) => (
                              <button
                                  key={i}
                                  onClick={() => selectSearchResult(result)}
                                  className="w-full text-left px-4 py-3 hover:bg-yellow-50 border-b border-gray-50 last:border-none transition-colors flex flex-col gap-0.5"
                              >
                                  <span className="font-medium text-gray-800 text-sm truncate w-full block">{result.display_name.split(',')[0]}</span>
                                  <span className="text-xs text-gray-400 truncate w-full block">{result.display_name}</span>
                              </button>
                          ))}
                      </div>
                  )}
              </div>
              <MapControls 
                onImportClick={() => fileInputRef.current?.click()} 
                mapStyle={mapStyle}
                onMapStyleChange={setMapStyle}
                onNextPin={moveToNextPin}
              />
          </div>
        )}

        {mapNotes.length === 0 && (
          <div className="absolute top-24 left-0 right-0 z-[400] pointer-events-none flex justify-center">
             <div className="relative">
                <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-lg text-sm text-gray-600 animate-bounce whitespace-nowrap">
                    Long press anywhere to pin
                </div>
             </div>
          </div>
        )}

        <div className="absolute bottom-24 left-4 z-[500]">
           <MapZoomController 
             min={isMapMode ? 13 : minImageZoom} 
             max={isMapMode ? 19 : 4} 
             step={isMapMode ? 1 : 0.1}
           />
        </div>

      </MapContainer>
      
      {isEditorOpen && (
        <NoteEditor 
            isOpen={isEditorOpen}
            onClose={closeEditor}
            onSave={handleSaveNote}
            onDelete={onDeleteNote}
            initialNote={editingNote || {}}
        />
      )}

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleImageImport(e.target.files)}
      />

      {/* 导入预览对话框 */}
      {showImportDialog && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4">
              <h3 className="text-lg font-bold text-gray-800">导入照片预览</h3>
              <div className="mt-1 text-sm text-gray-600">
                可导入: {importPreview.filter(p => !p.error).length} 张 | 
                无法导入: {importPreview.filter(p => p.error).length} 张
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-3 gap-2">
                {importPreview.map((preview, index) => (
                  <div key={index} className="relative aspect-square">
                    <img 
                      src={preview.imageUrl} 
                      alt={`Preview ${index + 1}`}
                      className="w-full h-full object-cover rounded-lg"
                    />
                    {preview.error ? (
                      <div className="absolute inset-0 bg-red-500/20 rounded-lg flex items-center justify-center">
                        <div className="text-center text-red-600 text-xs px-2">
                          <X size={16} className="mx-auto mb-1" />
                          {preview.error}
                        </div>
                      </div>
                    ) : (
                      <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1">
                        <Check size={12} />
                      </div>
                    )}
                    {!preview.error && (
                      <div className="mt-1 text-xs text-gray-600">
                        {preview.lat.toFixed(6)}, {preview.lng.toFixed(6)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            
            <div className="p-4 flex justify-end gap-2">
              <button
                onClick={handleCancelImport}
                className="px-6 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 font-medium transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={importPreview.filter(p => !p.error).length === 0}
                className="px-6 py-2 bg-[#FFDD00] hover:bg-[#E6C700] disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg text-gray-900 font-medium transition-colors"
              >
                确定导入 ({importPreview.filter(p => !p.error).length} 张)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
