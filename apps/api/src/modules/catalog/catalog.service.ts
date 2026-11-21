import { db, restaurants, menuCategories, menuItems, modifierGroups, modifierOptions, serviceZones } from '@tiffin/db';
import { sql, eq, and, desc, asc } from 'drizzle-orm';
import { redis } from '../../lib/redis';

export interface NearbyRestaurantResult {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  cuisineTypes: string[];
  ratingAverage: number;
  ratingCount: number;
  heroImageUrl: string | null;
  isOpenNow: boolean;
  distanceMeters: number;
  etaMinutesRange: string;
}

export class CatalogService {
  /**
   * Evaluates if a restaurant is currently open based on Asia/Kolkata schedule AND manual toggle.
   */
  isRestaurantOpenNow(operatingHours: any, acceptingOrders: boolean, isOpen: boolean): boolean {
    if (!isOpen || !acceptingOrders) return false;
    if (!operatingHours || Object.keys(operatingHours).length === 0) return true;

    // Get current time in Asia/Kolkata (UTC + 5:30)
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const day = (parts.find((p) => p.type === 'weekday')?.value || 'monday').toLowerCase();
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '12', 10);
    const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
    const currentMinutes = hour * 60 + minute;

    const daySchedule = operatingHours[day];
    if (!daySchedule || !daySchedule.open || !daySchedule.close) {
      return true; // Default to open if schedule not configured for this day
    }

    const [openH, openM] = daySchedule.open.split(':').map(Number);
    const [closeH, closeM] = daySchedule.close.split(':').map(Number);
    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
  }

  /**
   * Discover restaurants within serviceable radius using PostGIS ST_DWithin and service_zones.
   */
  async getNearbyRestaurants(
    lat: number,
    lng: number,
    radiusMeters = 5000,
    page = 1,
    limit = 20
  ): Promise<{
    serviceable: boolean;
    page: number;
    limit: number;
    total: number;
    restaurants: NearbyRestaurantResult[];
  }> {
    // Step 1: Check if coordinates are inside an active service zone
    const zoneCheckSql = sql`
      SELECT id, name
      FROM service_zones
      WHERE is_active = true
        AND ST_Contains(
          boundary::geometry,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geometry
        )
      LIMIT 1
    `;
    const zoneCheck = await db.execute(zoneCheckSql);
    const isServiceable = zoneCheck.rows.length > 0;

    if (!isServiceable) {
      return {
        serviceable: false,
        page,
        limit,
        total: 0,
        restaurants: [],
      };
    }

    // Step 2: Query nearby restaurants using PostGIS ST_DWithin and ST_Distance
    const offset = (page - 1) * limit;

    const querySql = sql`
      SELECT
        id,
        name,
        slug,
        description,
        cuisine_types,
        rating_average,
        rating_count,
        hero_image_url,
        is_open,
        accepting_orders,
        operating_hours,
        prep_time_default_minutes,
        ROUND(ST_Distance(geog, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography)) AS distance_meters
      FROM restaurants
      WHERE status = 'APPROVED'
        AND ST_DWithin(
          geog,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radiusMeters}
        )
      ORDER BY is_open DESC, accepting_orders DESC, distance_meters ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countSql = sql`
      SELECT COUNT(*)::int AS count
      FROM restaurants
      WHERE status = 'APPROVED'
        AND ST_DWithin(
          geog,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radiusMeters}
        )
    `;

    const [rowsResult, countResult] = await Promise.all([
      db.execute(querySql),
      db.execute(countSql),
    ]);

    const total = (countResult.rows[0] as any)?.count || 0;

    const formatted: NearbyRestaurantResult[] = rowsResult.rows.map((row: any) => {
      const openNow = this.isRestaurantOpenNow(
        row.operating_hours,
        row.accepting_orders,
        row.is_open
      );
      const distanceMeters = Number(row.distance_meters);
      const prepMin = Number(row.prep_time_default_minutes) || 15;
      const travelMin = Math.ceil(distanceMeters / 300) + 3; // Approx 300m/min bike speed in traffic + 3m buffer
      const minEta = prepMin + travelMin;
      const maxEta = minEta + 10;

      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        cuisineTypes: row.cuisine_types || [],
        ratingAverage: parseFloat(row.rating_average || '4.50'),
        ratingCount: Number(row.rating_count) || 0,
        heroImageUrl: row.hero_image_url,
        isOpenNow: openNow,
        distanceMeters,
        etaMinutesRange: `${minEta}-${maxEta} mins`,
      };
    });

    return {
      serviceable: true,
      page,
      limit,
      total,
      restaurants: formatted,
    };
  }

  /**
   * Search restaurants and dishes via FTS, word_similarity, and prefix matching.
   */
  async searchCatalog(
    queryText: string,
    lat: number,
    lng: number,
    radiusMeters = 6000,
    page = 1,
    limit = 20
  ) {
    const q = queryText.trim();
    if (q.length < 2) {
      return { query: q, matchedRestaurants: [], matchedDishes: [] };
    }

    const isShortPrefix = q.length < 4;

    // Search restaurants matching name or cuisine
    const restaurantSearchSql = sql`
      SELECT
        id,
        name,
        slug,
        cuisine_types,
        rating_average,
        rating_count,
        hero_image_url,
        is_open,
        accepting_orders,
        operating_hours,
        prep_time_default_minutes,
        ROUND(ST_Distance(geog, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography)) AS distance_meters
      FROM restaurants
      WHERE status = 'APPROVED'
        AND ST_DWithin(geog, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusMeters})
        AND (
          name ILIKE ${q + '%'}
          OR word_similarity(${q}, name) > 0.25
          OR to_tsvector('simple', name) @@ plainto_tsquery('simple', ${q})
          OR EXISTS (
            SELECT 1 FROM unnest(cuisine_types) AS c
            WHERE c ILIKE ${'%' + q + '%'}
          )
        )
      ORDER BY
        CASE WHEN name ILIKE ${q + '%'} THEN 1 ELSE 2 END,
        word_similarity(${q}, name) DESC,
        distance_meters ASC
      LIMIT 10
    `;

    // Search individual dishes matching query
    const dishSearchSql = sql`
      SELECT
        m.id,
        m.restaurant_id,
        m.name,
        m.description,
        m.price_paise,
        m.is_veg,
        m.is_available,
        r.name AS restaurant_name,
        r.slug AS restaurant_slug,
        ROUND(ST_Distance(r.geog, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography)) AS distance_meters
      FROM menu_items m
      JOIN restaurants r ON r.id = m.restaurant_id
      WHERE r.status = 'APPROVED'
        AND ST_DWithin(r.geog, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusMeters})
        AND (
          m.name ILIKE ${q + '%'}
          OR word_similarity(${q}, m.name) > 0.25
          OR to_tsvector('simple', m.name) @@ plainto_tsquery('simple', ${q})
        )
      ORDER BY
        CASE WHEN m.name ILIKE ${q + '%'} THEN 1 ELSE 2 END,
        word_similarity(${q}, m.name) DESC,
        m.is_available DESC
      LIMIT 15
    `;

    const [restRes, dishRes] = await Promise.all([
      db.execute(restaurantSearchSql),
      db.execute(dishSearchSql),
    ]);

    return {
      query: q,
      matchedRestaurants: restRes.rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        cuisineTypes: r.cuisine_types,
        ratingAverage: parseFloat(r.rating_average || '4.50'),
        distanceMeters: Number(r.distance_meters),
        isOpenNow: this.isRestaurantOpenNow(r.operating_hours, r.accepting_orders, r.is_open),
      })),
      matchedDishes: dishRes.rows.map((d: any) => ({
        id: d.id,
        restaurantId: d.restaurant_id,
        restaurantName: d.restaurant_name,
        restaurantSlug: d.restaurant_slug,
        name: d.name,
        description: d.description,
        pricePaise: Number(d.price_paise),
        isVeg: Boolean(d.is_veg),
        isAvailable: Boolean(d.is_available),
        distanceMeters: Number(d.distance_meters),
      })),
    };
  }

  /**
   * Retrieve full restaurant menu with hierarchical modifier groups and versioned Redis display cache.
   */
  async getRestaurantMenu(restaurantId: string) {
    const restaurant = await db.query.restaurants.findFirst({
      where: eq(restaurants.id, restaurantId),
    });

    if (!restaurant) {
      throw new Error('Restaurant not found');
    }

    const cacheKey = `menu:${restaurantId}:v${restaurant.menuVersion}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // Fallback to DB
      }
    }

    // Fetch categories
    const categories = await db.query.menuCategories.findMany({
      where: eq(menuCategories.restaurantId, restaurantId),
      orderBy: [asc(menuCategories.sortOrder)],
    });

    // Fetch all items
    const items = await db.query.menuItems.findMany({
      where: eq(menuItems.restaurantId, restaurantId),
      orderBy: [asc(menuItems.sortOrder)],
    });

    // Fetch modifier groups and options for all items
    const itemIds = items.map((i) => i.id);
    let allGroups: any[] = [];
    let allOptions: any[] = [];

    if (itemIds.length > 0) {
      allGroups = await db.query.modifierGroups.findMany({
        where: sql`${modifierGroups.menuItemId} = ANY(${itemIds})`,
        orderBy: [asc(modifierGroups.sortOrder)],
      });

      const groupIds = allGroups.map((g) => g.id);
      if (groupIds.length > 0) {
        allOptions = await db.query.modifierOptions.findMany({
          where: sql`${modifierOptions.modifierGroupId} = ANY(${groupIds})`,
          orderBy: [asc(modifierOptions.sortOrder)],
        });
      }
    }

    // Assemble hierarchical menu tree
    const formattedCategories = categories.map((cat) => {
      const catItems = items
        .filter((item) => item.categoryId === cat.id)
        .map((item) => {
          const itemGroups = allGroups
            .filter((g) => g.menuItemId === item.id)
            .map((g) => ({
              id: g.id,
              name: g.name,
              minSelections: g.minSelections,
              maxSelections: g.maxSelections,
              options: allOptions
                .filter((opt) => opt.modifierGroupId === g.id)
                .map((opt) => ({
                  id: opt.id,
                  name: opt.name,
                  pricePaise: opt.pricePaise,
                  isVeg: opt.isVeg,
                })),
            }));

          return {
            id: item.id,
            name: item.name,
            description: item.description,
            pricePaise: item.pricePaise,
            isVeg: item.isVeg,
            isAvailable: item.isAvailable,
            imageUrl: item.imageUrl,
            modifierGroups: itemGroups,
          };
        });

      return {
        id: cat.id,
        name: cat.name,
        sortOrder: cat.sortOrder,
        items: catItems,
      };
    });

    const fullMenu = {
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        description: restaurant.description,
        cuisineTypes: restaurant.cuisineTypes,
        ratingAverage: parseFloat(restaurant.ratingAverage),
        ratingCount: restaurant.ratingCount,
        heroImageUrl: restaurant.heroImageUrl,
        isOpenNow: this.isRestaurantOpenNow(
          restaurant.operatingHours,
          restaurant.acceptingOrders,
          restaurant.isOpen
        ),
        acceptingOrders: restaurant.acceptingOrders,
        prepTimeDefaultMinutes: restaurant.prepTimeDefaultMinutes,
        deliveryRadiusMeters: restaurant.deliveryRadiusMeters,
        menuVersion: restaurant.menuVersion,
        fssaiLicNo: restaurant.fssaiLicNo,
      },
      categories: formattedCategories,
    };

    // Cache in Redis for display (1 hour TTL)
    await redis.set(cacheKey, JSON.stringify(fullMenu), 'EX', 3600);

    return fullMenu;
  }
}

export const catalogService = new CatalogService();
