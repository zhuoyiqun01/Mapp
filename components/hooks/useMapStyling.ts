import { useState, useMemo } from 'react';
import { MAP_STYLE_OPTIONS } from '../constants';

interface UseMapStylingProps {
  mapStyleId?: string;
  onMapStyleChange?: (styleId: string) => void;
}

export const useMapStyling = ({ mapStyleId, onMapStyleChange }: UseMapStylingProps) => {
  // Map style state - satellite toggle is independent from mapStyleId
  // mapStyleId is for base map style (from settings), localMapStyle is for satellite toggle
  const [localMapStyle, setLocalMapStyle] = useState<'standard' | 'satellite'>('standard');

  // If satellite is active, use satellite; otherwise use mapStyleId or default
  const effectiveMapStyle = useMemo(() => {
    return localMapStyle === 'satellite' ? 'satellite' : (mapStyleId || 'carto-light-nolabels');
  }, [localMapStyle, mapStyleId]);

  // For the toggle button - returns the local style state
  const mapStyle = localMapStyle;

  // Handle local style change (satellite/standard toggle)
  const handleLocalMapStyleChange = (style: 'standard' | 'satellite') => {
    setLocalMapStyle(style);
  };

  // Handle base map style change (from settings)
  const handleMapStyleChange = (styleId: string) => {
    onMapStyleChange?.(styleId);
  };

  // Get tile layer configuration
  const getTileLayerConfig = useMemo(() => {
    if (effectiveMapStyle === 'satellite') {
      return {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      };
    } else {
      const styleOption = MAP_STYLE_OPTIONS.find(s => s.id === effectiveMapStyle) || MAP_STYLE_OPTIONS[0];
      return {
        url: styleOption.url,
        attribution: styleOption.attribution
      };
    }
  }, [effectiveMapStyle]);

  return {
    mapStyle,
    effectiveMapStyle,
    localMapStyle,
    setLocalMapStyle,
    handleLocalMapStyleChange,
    handleMapStyleChange,
    getTileLayerConfig
  };
};
