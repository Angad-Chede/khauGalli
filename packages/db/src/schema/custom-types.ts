import { customType } from 'drizzle-orm/pg-core';

export interface GeoPoint {
  lng: number;
  lat: number;
}

export function serializeGeoPoint(value: GeoPoint): string {
  return `SRID=4326;POINT(${value.lng} ${value.lat})`;
}

export function parseGeoPoint(value: string): GeoPoint {
  if (!value) return { lng: 0, lat: 0 };
  const match = value.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
  if (!match) return { lng: 0, lat: 0 };
  return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
}

export function serializeGeoPolygon(points: [number, number][]): string {
  const coords = points.map(([lng, lat]) => `${lng} ${lat}`).join(', ');
  return `SRID=4326;POLYGON((${coords}))`;
}

export function parseGeoPolygon(value: string): [number, number][] {
  if (!value) return [];
  const match = value.match(/POLYGON\s*\(\(\s*([^)]+)\s*\)\)/i);
  if (!match) return [];
  return match[1].split(',').map((pair) => {
    const [lng, lat] = pair.trim().split(/\s+/).map(Number);
    return [lng, lat] as [number, number];
  });
}

/**
 * Custom PostGIS geography(Point, 4326) column.
 */
export const geographyPoint = customType<{ data: GeoPoint; driverData: string }>({
  dataType() {
    return 'geography(Point, 4326)';
  },
  toDriver(value: GeoPoint): string {
    return serializeGeoPoint(value);
  },
  fromDriver(value: string): GeoPoint {
    return parseGeoPoint(value);
  },
});

/**
 * Custom PostGIS geography(Polygon, 4326) column.
 */
export const geographyPolygon = customType<{ data: [number, number][]; driverData: string }>({
  dataType() {
    return 'geography(Polygon, 4326)';
  },
  toDriver(points: [number, number][]): string {
    return serializeGeoPolygon(points);
  },
  fromDriver(value: string): [number, number][] {
    return parseGeoPolygon(value);
  },
});
