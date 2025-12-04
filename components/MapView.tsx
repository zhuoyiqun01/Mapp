
import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, ImageOverlay, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Note, Coordinates, Project } from '../types';
import { MAP_TILE_URL, MAP_ATTRIBUTION } from '../constants';
import { Search, Locate, Loader2 } from 'lucide-react';
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
  
  useEffect(() => {
    const container = map.getContainer();

    const handleStart = (e: TouchEvent | MouseEvent) => {
      if (e instanceof MouseEvent && e.button !== 0) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      startPosRef.current = { x: clientX, y: clientY };

      timerRef.current = setTimeout(() => {
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
       const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
       const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
       const dx = clientX - startPosRef.current.x;
       const dy = clientY - startPosRef.current.y;
       const dist = Math.sqrt(dx*dx + dy*dy);
       if (dist > 10) {
         clearTimeout(timerRef.current);
         timerRef.current = null;
         startPosRef.current = null;
       }
    };

    const handleEnd = () => {
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
    container.addEventListener('touchend', handleEnd);
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

const MapControls = () => {
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
                className="bg-white p-3 rounded-xl shadow-lg hover:bg-[#FFDD00]/10 text-gray-700 transition-colors"
                title="Locate Me"
            >
                <Locate size={20} />
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
  const [minImageZoom, setMinImageZoom] = useState(-5);

  const defaultCenter: [number, number] = [28.1847, 112.9467];
  const isMapMode = project.type === 'map';

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
    setEditingNote(note);
    setIsEditorOpen(true);
    onToggleEditor(true);
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

  const createCustomIcon = (emoji: string) => {
      return L.divIcon({
          className: 'custom-icon',
         html: `<div style="
            background-color: #FFDD00; 
            width: 40px; 
            height: 40px; 
            border-radius: 50% 50% 50% 0; 
            transform: rotate(-45deg);
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
            border: 2px solid white;
          ">
            <span style="transform: rotate(45deg); font-size: 20px; line-height: 1;">${emoji}</span>
          </div>`,
          iconSize: [40, 40],
          iconAnchor: [20, 40],
          popupAnchor: [0, -40]
      });
  };

  const mapNotes = notes.filter(n => n.variant === 'standard' || !n.variant);

  return (
    <div id="map-view-container" className="relative w-full h-full z-0 bg-gray-100">
      <MapContainer 
        key={project.id} 
        center={isMapMode ? defaultCenter : [500, 500]} 
        zoom={isMapMode ? 16 : -3}
        minZoom={isMapMode ? 14 : -5} 
        maxZoom={isMapMode ? 18 : 4}
        crs={isMapMode ? L.CRS.EPSG3857 : L.CRS.Simple}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        ref={setMapInstance}
        doubleClickZoom={false}
      >
        {isMapMode ? (
           <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} />
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
        
        {mapNotes.map(note => (
          <Marker 
            key={note.id} 
            position={[note.coords.lat, note.coords.lng]}
            icon={createCustomIcon(note.emoji)}
            eventHandlers={{ click: () => handleMarkerClick(note) }}
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
                                  className="w-full text-left px-4 py-3 hover:bg-[#FFDD00]/10 border-b border-gray-50 last:border-none transition-colors flex flex-col gap-0.5"
                              >
                                  <span className="font-medium text-gray-800 text-sm truncate w-full block">{result.display_name.split(',')[0]}</span>
                                  <span className="text-xs text-gray-400 truncate w-full block">{result.display_name}</span>
                              </button>
                          ))}
                      </div>
                  )}
              </div>
              <MapControls />
          </div>
        )}

        {mapNotes.length === 0 && (
          <div className="absolute top-4 left-0 right-0 z-[400] pointer-events-none flex justify-center">
             <div className="relative">
                <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-lg text-sm text-gray-600 animate-bounce whitespace-nowrap">
                    Long press anywhere to pin
                </div>
             </div>
          </div>
        )}

        <div className="absolute bottom-24 left-4 z-[500]">
           <MapZoomController 
             min={isMapMode ? 14 : minImageZoom} 
             max={isMapMode ? 18 : 4} 
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
    </div>
  );
};
