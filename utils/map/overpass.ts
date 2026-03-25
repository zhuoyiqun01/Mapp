/**
 * Utility for querying OpenStreetMap data via Overpass API
 */

export interface OverpassElement {
  type: 'relation' | 'way' | 'node';
  id: number;
  tags?: Record<string, string>;
  members?: Array<{
    type: 'node' | 'way' | 'relation';
    ref: number;
    role: string;
    geometry?: Array<{ lat: number; lon: number }>;
  }>;
  geometry?: Array<{ lat: number; lon: number }>;
}

export interface OverpassResponse {
  elements: OverpassElement[];
}

/**
 * Fetch search results (POI or boundaries) from Nominatim
 */
export const searchRegionBoundaries = async (name: string): Promise<any[]> => {
  // Removed featuretype restriction to allow finding POIs, buildings, etc.
  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(name)}&limit=10&addressdetails=1`);
  if (!response.ok) throw new Error('Nominatim search failed');
  
  const data = await response.json();
  return data; // Return all results including nodes
};

/**
 * Fetch full geometry for a specific OSM ID
 */
export const fetchRelationGeometry = async (osmId: number, osmType: 'relation' | 'way' | 'node' = 'relation'): Promise<any> => {
  const query = `
    [out:json][timeout:25];
    ${osmType}(${osmId});
    out geom;
  `;
  
  const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error('Overpass API request failed');
  
  const data: OverpassResponse = await response.json();
  const element = data.elements.find(e => e.id === osmId);
  
  if (!element) {
    throw new Error('No data found for this ID');
  }

  return convertOsmToGeoJSON(element);
};

/**
 * Enhanced converter from OSM to GeoJSON
 * Handles both Relations (with members) and Ways (with direct geometry)
 */
function convertOsmToGeoJSON(element: OverpassElement): any {
  // Case 1: Relation (multi-polygon or complex boundary)
  if (element.members && element.members.length > 0) {
    const ways = element.members
      .filter(m => m.type === 'way' && m.geometry && m.geometry.length > 0)
      .map(m => ({
        role: m.role || 'outer',
        coordinates: m.geometry!.map(g => [g.lon, g.lat])
      }));

    if (ways.length === 0) return null;

    return {
      type: 'FeatureCollection',
      features: ways.map(way => ({
        type: 'Feature',
        properties: { role: way.role, ...element.tags },
        geometry: { type: 'LineString', coordinates: way.coordinates }
      }))
    };
  }

  // Case 2: Way (simple closed boundary or line)
  if (element.geometry && element.geometry.length > 0) {
    const coordinates = element.geometry.map(g => [g.lon, g.lat]);
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { ...element.tags },
        geometry: { type: 'LineString', coordinates }
      }]
    };
  }

  return null;
}

