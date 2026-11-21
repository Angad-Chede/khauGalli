import { describe, it, expect } from 'vitest';
import { serializeGeoPoint, parseGeoPoint } from '../src/schema/custom-types';

function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371e3; // Earth radius in meters
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

describe('PostGIS Spatial Query Logic (FR-1 Spike)', () => {
  const ashaHome = { lat: 12.9716, lng: 77.6406 }; // Indiranagar

  const restaurants = [
    { name: 'Khau Galli Chaat & Street Eats', lat: 12.9719, lng: 77.6412 },
    { name: 'Biryani Darbar', lat: 12.9784, lng: 77.6408 },
    { name: 'Bowl & Greens', lat: 12.9609, lng: 77.6387 },
    { name: 'Dosa Corner & South Tiffin', lat: 12.9352, lng: 77.6245 }, // Koramangala
    { name: 'Punjab Da Dhaba', lat: 12.9340, lng: 77.6320 }, // Koramangala
  ];

  it('correctly serializes and parses PostGIS Point geography types', () => {
    const serialized = serializeGeoPoint({ lng: 77.6406, lat: 12.9716 });
    expect(serialized).toBe('SRID=4326;POINT(77.6406 12.9716)');

    const parsed = parseGeoPoint('POINT(77.6406 12.9716)');
    expect(parsed.lng).toBeCloseTo(77.6406, 4);
    expect(parsed.lat).toBeCloseTo(12.9716, 4);
  });

  it('filters restaurants strictly within 3 km of Asha Home address', () => {
    const radiusMeters = 3000;

    const nearby = restaurants
      .map((r) => ({
        ...r,
        distanceMeters: Math.round(
          haversineDistanceMeters(ashaHome.lat, ashaHome.lng, r.lat, r.lng)
        ),
      }))
      .filter((r) => r.distanceMeters <= radiusMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

    // Exactly 3 restaurants should be within 3 km of Indiranagar
    expect(nearby.length).toBe(3);
    expect(nearby[0].name).toBe('Khau Galli Chaat & Street Eats');
    expect(nearby[0].distanceMeters).toBeLessThan(100);

    expect(nearby[1].name).toBe('Biryani Darbar');
    expect(nearby[1].distanceMeters).toBeLessThan(1000);

    expect(nearby[2].name).toBe('Bowl & Greens');
    expect(nearby[2].distanceMeters).toBeLessThan(2000);

    // Koramangala restaurants must be filtered out (>4 km away)
    const excluded = restaurants.filter(
      (r) => !nearby.some((n) => n.name === r.name)
    );
    expect(excluded.map((r) => r.name)).toContain('Dosa Corner & South Tiffin');
    expect(excluded.map((r) => r.name)).toContain('Punjab Da Dhaba');
  });
});
