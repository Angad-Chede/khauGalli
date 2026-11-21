import { describe, it, expect } from 'vitest';

const R = 6371e3; // Earth radius in meters

function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Exact coordinate offset for a target distance in meters along the north-south meridian.
 */
function offsetNorthMeters(lat: number, meters: number): number {
  const deltaRad = meters / R;
  return lat + (deltaRad * 180) / Math.PI;
}

function isPointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [lng, lat] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

describe('Radius Edges & Service Zone Boundary Tests', () => {
  const customerCoord = { lat: 12.9716, lng: 77.6406 }; // Asha Indiranagar

  const blrServiceZone: [number, number][] = [
    [77.58, 12.92],
    [77.67, 12.92],
    [77.67, 13.01],
    [77.58, 13.01],
    [77.58, 12.92],
  ];

  it('includes restaurant at 2,999 m and excludes restaurant at 3,001 m for 3km radius query', () => {
    const radiusMeters = 3000;

    const restAt2999m = {
      name: 'Restaurant Edge Inside',
      lat: offsetNorthMeters(customerCoord.lat, 2999),
      lng: customerCoord.lng,
    };

    const restAt3001m = {
      name: 'Restaurant Edge Outside',
      lat: offsetNorthMeters(customerCoord.lat, 3001),
      lng: customerCoord.lng,
    };

    const dist1 = haversineDistanceMeters(
      customerCoord.lat,
      customerCoord.lng,
      restAt2999m.lat,
      restAt2999m.lng
    );
    const dist2 = haversineDistanceMeters(
      customerCoord.lat,
      customerCoord.lng,
      restAt3001m.lat,
      restAt3001m.lng
    );

    expect(dist1).toBeLessThanOrEqual(3000);
    expect(dist2).toBeGreaterThan(3000);

    const isInside1 = dist1 <= radiusMeters;
    const isInside2 = dist2 <= radiusMeters;

    expect(isInside1).toBe(true);
    expect(isInside2).toBe(false);
  });

  it('correctly marks coordinates inside Bengaluru Central polygon as serviceable and outside as unserviceable', () => {
    expect(isPointInPolygon([77.6406, 12.9716], blrServiceZone)).toBe(true);
    expect(isPointInPolygon([77.6083, 12.9698], blrServiceZone)).toBe(true);
    expect(isPointInPolygon([77.7064, 13.1986], blrServiceZone)).toBe(false);
    expect(isPointInPolygon([77.8253, 12.7409], blrServiceZone)).toBe(false);
  });
});
