import { useState, useCallback, useEffect, useRef } from 'react';
import type { Note } from '../../types';

interface ClusterResult {
  notes: Note[];
  position: [number, number];
}

function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    const favA = a.isFavorite ? 1 : 0;
    const favB = b.isFavorite ? 1 : 0;
    if (favA !== favB) return favB - favA;
    if (Math.abs(a.coords.lat - b.coords.lat) > 0.0001) {
      return a.coords.lat - b.coords.lat;
    }
    return a.coords.lng - b.coords.lng;
  });
}

function calculatePinDistance(
  map: L.Map,
  note1: Note,
  note2: Note
): number | null {
  try {
    const container = map.getContainer();
    if (!container) return null;

    const point1 = map.latLngToContainerPoint([note1.coords.lat, note1.coords.lng]);
    const point2 = map.latLngToContainerPoint([note2.coords.lat, note2.coords.lng]);

    if (
      !point1 ||
      !point2 ||
      isNaN(point1.x) ||
      isNaN(point1.y) ||
      isNaN(point2.x) ||
      isNaN(point2.y)
    ) {
      return null;
    }

    return point1.distanceTo(point2);
  } catch (e) {
    console.warn('Distance calculation error:', e);
    return null;
  }
}

function detectClusters(
  notes: Note[],
  map: L.Map,
  threshold: number,
  forceSingleNoteIds: string[] = []
): ClusterResult[] {
  if (!map || notes.length === 0) return [];

  try {
    const container = map.getContainer();
    if (!container || !container.offsetParent) return [];
  } catch {
    return [];
  }

  const sortedNotes = sortNotes(notes);
  const forceSet = new Set(forceSingleNoteIds);
  const clusters: ClusterResult[] = [];
  const processed = new Set<string>();

  sortedNotes.forEach((note) => {
    if (processed.has(note.id)) return;

    const cluster: Note[] = [note];
    processed.add(note.id);

    // 被强制单独显示的点不与其他点聚合
    if (!forceSet.has(note.id)) {
      sortedNotes.forEach((otherNote) => {
        if (processed.has(otherNote.id)) return;
        if (forceSet.has(otherNote.id)) return;

        const distance = calculatePinDistance(map, note, otherNote);
        if (distance !== null && distance < threshold) {
          cluster.push(otherNote);
          processed.add(otherNote.id);
        }
      });
    }

    const clusterNotes = sortNotes(cluster);
    const bottomNote = clusterNotes[0];
    clusters.push({
      notes: clusterNotes,
      position: [bottomNote.coords.lat, bottomNote.coords.lng]
    });
  });

  return clusters;
}

interface UseMapClusteringProps {
  mapInstance: L.Map | null;
  getFilteredNotes: () => Note[];
  clusterThreshold: number;
  /** 这些 noteId 强制不参与聚合，始终以单独 pin 显示（用于连线端点） */
  forceSingleNoteIds?: string[];
}

export function useMapClustering({
  mapInstance,
  getFilteredNotes,
  clusterThreshold,
  forceSingleNoteIds = []
}: UseMapClusteringProps) {
  const [clusteredMarkers, setClusteredMarkers] = useState<ClusterResult[]>([]);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    mapInstanceRef.current = mapInstance;
  }, [mapInstance]);

  useEffect(() => {
    if (!mapInstance) {
      setClusteredMarkers([]);
      return;
    }

    let updateTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let rafId: number | null = null;
    let isZooming = false;

    const updateClusters = () => {
      const currentMap = mapInstanceRef.current;
      if (!currentMap) return;

      if (updateTimeoutId) {
        clearTimeout(updateTimeoutId);
        updateTimeoutId = null;
      }

      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      const requestedRafId = requestAnimationFrame(() => {
        const currentMap = mapInstanceRef.current;
        if (!currentMap) return;

        try {
          const container = currentMap.getContainer();
          if (!container || !container.offsetParent) {
            updateTimeoutId = setTimeout(updateClusters, 50);
            return;
          }

          const mapPane = currentMap.getPane('mapPane');
          if (!mapPane) {
            updateTimeoutId = setTimeout(updateClusters, 50);
            return;
          }

          const clusters = detectClusters(
            getFilteredNotes(),
            currentMap,
            clusterThreshold,
            forceSingleNoteIds
          );
          setClusteredMarkers(clusters);
        } catch (e) {
          console.warn('Failed to update clusters:', e);
          updateTimeoutId = setTimeout(updateClusters, 50);
        }
      });
      rafId = requestedRafId;
    };

    const timeoutId = setTimeout(updateClusters, 100);

    const handleZoom = () => {
      isZooming = true;
      if (updateTimeoutId) {
        clearTimeout(updateTimeoutId);
        updateTimeoutId = null;
      }
      updateClusters();
    };

    const handleZoomEnd = () => {
      isZooming = false;
      if (updateTimeoutId) {
        clearTimeout(updateTimeoutId);
        updateTimeoutId = null;
      }
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      updateTimeoutId = setTimeout(() => {
        updateClusters();
        updateTimeoutId = setTimeout(updateClusters, 150);
      }, 100);
    };

    const handleMoveEnd = () => {
      if (isZooming) return;
      if (updateTimeoutId) clearTimeout(updateTimeoutId);
      updateTimeoutId = setTimeout(updateClusters, 50);
    };

    mapInstance.on('zoom', handleZoom);
    mapInstance.on('zoomend', handleZoomEnd);
    mapInstance.on('moveend', handleMoveEnd);

    return () => {
      clearTimeout(timeoutId);
      if (updateTimeoutId) clearTimeout(updateTimeoutId);
      if (rafId !== null) cancelAnimationFrame(rafId);
      mapInstance.off('zoom', handleZoom);
      mapInstance.off('zoomend', handleZoomEnd);
      mapInstance.off('moveend', handleMoveEnd);
    };
  }, [mapInstance, getFilteredNotes, clusterThreshold]);

  const sortNotesCallback = useCallback((notes: Note[]) => sortNotes(notes), []);

  return { clusteredMarkers, sortNotes: sortNotesCallback };
}
