import { useState, useCallback } from 'react';
import type { Note } from '../../types';
import { fetchRelationGeometry } from '../../utils/map/overpass';
import { generateId } from '../../utils';

interface UseBorderSearchProps {
  mapInstance: L.Map | null;
  notes: Note[];
  onAddNote: (note: Note) => void;
  setBorderGeoJSON: ((data: any) => void) | undefined;
  setShowBorderPanel: ((show: boolean) => void) | undefined;
}

export function useBorderSearch({
  mapInstance,
  notes,
  onAddNote,
  setBorderGeoJSON,
  setShowBorderPanel
}: UseBorderSearchProps) {
  const [borderSearchQuery, setBorderSearchQuery] = useState('');
  const [borderSearchResults, setBorderSearchResults] = useState<any[]>([]);
  const [isSearchingBorder, setIsSearchingBorder] = useState(false);
  const [borderSearchError, setBorderSearchError] = useState<string | null>(null);
  const [borderSearchMode, setBorderSearchMode] = useState<'region' | 'place'>('region');
  const [pendingPlaceNote, setPendingPlaceNote] = useState<{
    lat: number;
    lng: number;
    name: string;
  } | null>(null);

  const handleBorderSearch = useCallback(async () => {
    if (!borderSearchQuery.trim()) return;

    setIsSearchingBorder(true);
    setBorderSearchError(null);
    setBorderSearchResults([]);

    try {
      const query = borderSearchQuery.trim();
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=15&addressdetails=1${borderSearchMode === 'region' ? '&featuretype=settlement,boundary,territory' : ''}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('Search failed');
      const results = await response.json();

      if (results.length === 0) {
        setBorderSearchError('No matching results found');
      } else {
        const sortedResults =
          borderSearchMode === 'region'
            ? [...results].sort((a: any, b: any) => {
                const score = (item: any) =>
                  item.osm_type === 'relation' ? 2 : item.osm_type === 'way' ? 1 : 0;
                return score(b) - score(a);
              })
            : results;
        setBorderSearchResults(sortedResults);
      }
    } catch (err) {
      console.error('Search failed:', err);
      setBorderSearchError('Search failed, please try again');
    } finally {
      setIsSearchingBorder(false);
    }
  }, [borderSearchQuery, borderSearchMode]);

  const handleSelectBorder = useCallback(
    async (result: any) => {
      setIsSearchingBorder(true);
      try {
        if (borderSearchMode === 'place' || result.osm_type === 'node') {
          const lat = parseFloat(result.lat);
          const lon = parseFloat(result.lon);
          const placeName = result.display_name.split(',')[0];

          if (mapInstance) {
            mapInstance.flyTo([lat, lon], 17, { duration: 1.5 });
          }

          const isDuplicate = notes.some(
            (n) =>
              Math.abs(n.coords.lat - lat) < 0.0001 && Math.abs(n.coords.lng - lon) < 0.0001
          );

          if (!isDuplicate) {
            setPendingPlaceNote({ lat, lng: lon, name: placeName });
          }
        } else {
          const geojson = await fetchRelationGeometry(result.osm_id, result.osm_type);
          if (setBorderGeoJSON) {
            setBorderGeoJSON(geojson);
          }

          if (mapInstance && geojson) {
            const L = await import('leaflet');
            const layer = L.default.geoJSON(geojson);
            mapInstance.fitBounds(layer.getBounds(), { padding: [20, 20], duration: 1.5 });
          }
        }

        if (setShowBorderPanel) setShowBorderPanel(false);
        setBorderSearchResults([]);
        setBorderSearchQuery('');
      } catch (err) {
        console.error('Search interaction failed:', err);
        setBorderSearchError('Failed to fetch details');
      } finally {
        setIsSearchingBorder(false);
      }
    },
    [borderSearchMode, mapInstance, notes, setBorderGeoJSON, setShowBorderPanel]
  );

  const handleConvertPendingToNote = useCallback(() => {
    if (!pendingPlaceNote) return;

    const newNote: Note = {
      id: generateId(),
      coords: { lat: pendingPlaceNote.lat, lng: pendingPlaceNote.lng },
      text: pendingPlaceNote.name,
      emoji: '📍',
      fontSize: 3,
      images: [],
      tags: [],
      variant: 'standard',
      createdAt: Date.now(),
      boardX: 0,
      boardY: 0
    };

    onAddNote(newNote);
    setPendingPlaceNote(null);
  }, [pendingPlaceNote, onAddNote]);

  const handleCopyBorder = useCallback(
    async (borderGeoJSON: any) => {
      if (!borderGeoJSON) return;
      try {
        await navigator.clipboard.writeText(JSON.stringify(borderGeoJSON));
        alert('Border GeoJSON copied to clipboard!');
      } catch (err) {
        console.error('Failed to copy border:', err);
        alert('Failed to copy border to clipboard');
      }
    },
    []
  );

  return {
    borderSearchQuery,
    setBorderSearchQuery,
    borderSearchResults,
    borderSearchError,
    isSearchingBorder,
    borderSearchMode,
    setBorderSearchMode,
    pendingPlaceNote,
    setPendingPlaceNote,
    handleBorderSearch,
    handleSelectBorder,
    handleConvertPendingToNote,
    handleCopyBorder
  };
}
