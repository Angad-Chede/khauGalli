import { db } from './client';
import {
  users,
  addresses,
  serviceZones,
  restaurants,
  restaurantStaff,
  menuCategories,
  menuItems,
  modifierGroups,
  modifierOptions,
} from './schema/index';
import { sql } from 'drizzle-orm';

// Deterministic seed IDs to guarantee idempotent re-runs
export const SEED_IDS = {
  ZONE_BLR_CENTRAL: '018f0000-0000-7000-8000-000000000001',
  USER_ASHA: '018f0000-0000-7000-8000-000000000011',
  USER_RAVI: '018f0000-0000-7000-8000-000000000012',
  USER_IMRAN: '018f0000-0000-7000-8000-000000000013',
  USER_MEERA: '018f0000-0000-7000-8000-000000000014',
  ADDR_ASHA_HOME: '018f0000-0000-7000-8000-000000000021',
  ADDR_ASHA_WORK: '018f0000-0000-7000-8000-000000000022',
  REST_KHAU_GALLI: '018f0000-0000-7000-8000-000000000101',
  REST_DOSA_CORNER: '018f0000-0000-7000-8000-000000000102',
  REST_BIRYANI_DARBAR: '018f0000-0000-7000-8000-000000000103',
  REST_PUNJAB_DHABA: '018f0000-0000-7000-8000-000000000104',
  REST_BOWL_GREENS: '018f0000-0000-7000-8000-000000000105',
};

export async function seedDatabase() {
  console.log('Seeding database with demo city data (idempotent)...');

  // 1. Seed Service Zone (Bengaluru Central: Indiranagar - Koramangala - CBD polygon)
  const blrPolygon: [number, number][] = [
    [77.5800, 12.9200],
    [77.6700, 12.9200],
    [77.6700, 13.0100],
    [77.5800, 13.0100],
    [77.5800, 12.9200], // Closed ring
  ];

  await db
    .insert(serviceZones)
    .values({
      id: SEED_IDS.ZONE_BLR_CENTRAL,
      name: 'Bengaluru Central Cluster (Indiranagar / Koramangala / CBD)',
      boundary: blrPolygon,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: serviceZones.id,
      set: {
        name: 'Bengaluru Central Cluster (Indiranagar / Koramangala / CBD)',
        boundary: blrPolygon,
        isActive: true,
      },
    });

  // 2. Seed Users (Demo Personas with is_demo: true)
  const demoUsers = [
    {
      id: SEED_IDS.USER_ASHA,
      phone: '+919999900001',
      name: 'Asha Sharma',
      email: 'asha.demo@tiffin.local',
      roles: ['CUSTOMER'],
      isDemo: true,
    },
    {
      id: SEED_IDS.USER_RAVI,
      phone: '+919999900002',
      name: 'Ravi Patel',
      email: 'ravi.patel@khaugalli.local',
      roles: ['RESTAURANT'],
      isDemo: true,
    },
    {
      id: SEED_IDS.USER_IMRAN,
      phone: '+919999900003',
      name: 'Imran Khan',
      email: 'imran.khan@tiffin.local',
      roles: ['RIDER'],
      isDemo: true,
    },
    {
      id: SEED_IDS.USER_MEERA,
      phone: '+919999900004',
      name: 'Meera Sundaram',
      email: 'meera.ops@tiffin.local',
      roles: ['ADMIN'],
      isDemo: true,
    },
  ];

  for (const u of demoUsers) {
    await db
      .insert(users)
      .values(u)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          name: u.name,
          email: u.email,
          roles: u.roles,
          isDemo: true,
        },
      });
  }

  // 3. Seed Asha's Delivery Addresses
  const ashaAddresses = [
    {
      id: SEED_IDS.ADDR_ASHA_HOME,
      userId: SEED_IDS.USER_ASHA,
      label: 'Home',
      line1: 'Flat 402, Shanti Nilaya, 12th Main, Indiranagar',
      landmark: 'Near Indiranagar Club',
      geog: { lng: 77.6406, lat: 12.9716 },
      isDefault: true,
    },
    {
      id: SEED_IDS.ADDR_ASHA_WORK,
      userId: SEED_IDS.USER_ASHA,
      label: 'Work',
      line1: 'WeWork Galaxy, 43 Residency Road, Ashok Nagar',
      landmark: 'Opposite Bangalore Club',
      geog: { lng: 77.6083, lat: 12.9698 },
      isDefault: false,
    },
  ];

  for (const a of ashaAddresses) {
    await db
      .insert(addresses)
      .values(a)
      .onConflictDoUpdate({
        target: addresses.id,
        set: {
          label: a.label,
          line1: a.line1,
          landmark: a.landmark,
          geog: a.geog,
          isDefault: a.isDefault,
        },
      });
  }

  // 4. Seed 5 Diverse Restaurants with real coordinates, hours and metrics
  const standardHours = {
    monday: { open: '09:00', close: '23:30' },
    tuesday: { open: '09:00', close: '23:30' },
    wednesday: { open: '09:00', close: '23:30' },
    thursday: { open: '09:00', close: '23:30' },
    friday: { open: '09:00', close: '23:30' },
    saturday: { open: '09:00', close: '23:30' },
    sunday: { open: '09:00', close: '23:30' },
  };

  const seededRestaurants = [
    {
      id: SEED_IDS.REST_KHAU_GALLI,
      name: 'Khau Galli Chaat & Street Eats',
      slug: 'khau-galli-chaat',
      description: 'Authentic Mumbai & Delhi street chaats, pav bhaji, and quick bites.',
      cuisineTypes: ['Street Food', 'Chaat', 'North Indian'],
      geog: { lng: 77.6412, lat: 12.9719 }, // Indiranagar (~70m from Asha Home)
      isOpen: true,
      acceptingOrders: true,
      menuVersion: 1,
      ratingAverage: '4.60',
      ratingCount: 142,
      deliveryRadiusMeters: 5000,
      operatingHours: standardHours,
      prepTimeDefaultMinutes: 15,
      commissionBps: 2000,
      gstin: '29ABCDE1234F1Z5',
      fssaiLicNo: '11223344556677',
      status: 'APPROVED',
    },
    {
      id: SEED_IDS.REST_DOSA_CORNER,
      name: 'Dosa Corner & South Tiffin',
      slug: 'dosa-corner',
      description: 'Crispy ghee dosas, piping hot podi idlis, and traditional filter coffee.',
      cuisineTypes: ['South Indian', 'Tiffin', 'Breakfast'],
      geog: { lng: 77.6245, lat: 12.9352 }, // Koramangala (~4.4km from Asha Home)
      isOpen: true,
      acceptingOrders: true,
      menuVersion: 1,
      ratingAverage: '4.70',
      ratingCount: 280,
      deliveryRadiusMeters: 6000,
      operatingHours: standardHours,
      prepTimeDefaultMinutes: 12,
      commissionBps: 1800,
      gstin: '29BCDEF2345G2Z6',
      fssaiLicNo: '11223344556688',
      status: 'APPROVED',
    },
    {
      id: SEED_IDS.REST_BIRYANI_DARBAR,
      name: 'Biryani Darbar',
      slug: 'biryani-darbar',
      description: 'Slow-cooked fragrant dum biryanis, succulent kebabs, and rich gravies.',
      cuisineTypes: ['Biryani', 'Mughlai', 'Kebabs'],
      geog: { lng: 77.6408, lat: 12.9784 }, // Indiranagar 100ft Rd (~750m from Asha Home)
      isOpen: true,
      acceptingOrders: true,
      menuVersion: 1,
      ratingAverage: '4.80',
      ratingCount: 520,
      deliveryRadiusMeters: 6000,
      operatingHours: standardHours,
      prepTimeDefaultMinutes: 25,
      commissionBps: 2200,
      gstin: '29CDEFG3456H3Z7',
      fssaiLicNo: '11223344556699',
      status: 'APPROVED',
    },
    {
      id: SEED_IDS.REST_PUNJAB_DHABA,
      name: 'Punjab Da Dhaba',
      slug: 'punjab-da-dhaba',
      description: 'Hearty buttery curries, tandoori breads, dal makhani, and thick lassi.',
      cuisineTypes: ['North Indian', 'Punjabi', 'Tandoor'],
      geog: { lng: 77.6320, lat: 12.9340 }, // Koramangala 4th Block (~4.5km)
      isOpen: true,
      acceptingOrders: true,
      menuVersion: 1,
      ratingAverage: '4.40',
      ratingCount: 195,
      deliveryRadiusMeters: 5000,
      operatingHours: standardHours,
      prepTimeDefaultMinutes: 20,
      commissionBps: 2000,
      gstin: '29DEFGHI4567I4Z8',
      fssaiLicNo: '11223344556610',
      status: 'APPROVED',
    },
    {
      id: SEED_IDS.REST_BOWL_GREENS,
      name: 'Bowl & Greens',
      slug: 'bowl-and-greens',
      description: 'Nutritious grain bowls, organic farm salads, and cold-pressed elixirs.',
      cuisineTypes: ['Healthy', 'Salads', 'Continental'],
      geog: { lng: 77.6387, lat: 12.9609 }, // Domlur (~1.2km from Asha Home)
      isOpen: true,
      acceptingOrders: true,
      menuVersion: 1,
      ratingAverage: '4.50',
      ratingCount: 88,
      deliveryRadiusMeters: 5000,
      operatingHours: standardHours,
      prepTimeDefaultMinutes: 15,
      commissionBps: 2000,
      gstin: '29EFGHIJ5678J5Z9',
      fssaiLicNo: '11223344556621',
      status: 'APPROVED',
    },
  ];

  for (const r of seededRestaurants) {
    await db
      .insert(restaurants)
      .values(r)
      .onConflictDoUpdate({
        target: restaurants.id,
        set: {
          name: r.name,
          slug: r.slug,
          description: r.description,
          cuisineTypes: r.cuisineTypes,
          geog: r.geog,
          isOpen: r.isOpen,
          acceptingOrders: r.acceptingOrders,
          menuVersion: r.menuVersion,
          ratingAverage: r.ratingAverage,
          ratingCount: r.ratingCount,
          deliveryRadiusMeters: r.deliveryRadiusMeters,
          operatingHours: r.operatingHours,
          prepTimeDefaultMinutes: r.prepTimeDefaultMinutes,
          commissionBps: r.commissionBps,
          status: r.status,
        },
      });
  }

  // 5. Seed Restaurant Staff (Ravi Patel as OWNER of Khau Galli Chaat)
  const staffId = '018f0000-0000-7000-8000-000000000201';
  await db
    .insert(restaurantStaff)
    .values({
      id: staffId,
      restaurantId: SEED_IDS.REST_KHAU_GALLI,
      userId: SEED_IDS.USER_RAVI,
      staffRole: 'OWNER',
    })
    .onConflictDoUpdate({
      target: [restaurantStaff.restaurantId, restaurantStaff.userId],
      set: {
        staffRole: 'OWNER',
      },
    });

  // 6. Seed Categories and Dishes for Khau Galli Chaat
  const catChaats = '018f0000-0000-7000-8000-000000000301';
  const catMains = '018f0000-0000-7000-8000-000000000302';
  const catDrinks = '018f0000-0000-7000-8000-000000000303';

  await db
    .insert(menuCategories)
    .values([
      { id: catChaats, restaurantId: SEED_IDS.REST_KHAU_GALLI, name: 'Street Chaats', sortOrder: 1 },
      { id: catMains, restaurantId: SEED_IDS.REST_KHAU_GALLI, name: 'Pav & Rolls', sortOrder: 2 },
      { id: catDrinks, restaurantId: SEED_IDS.REST_KHAU_GALLI, name: 'Refreshers', sortOrder: 3 },
    ])
    .onConflictDoUpdate({
      target: menuCategories.id,
      set: { name: sql`EXCLUDED.name`, sortOrder: sql`EXCLUDED.sort_order` },
    });

  const itemPaniPuri = '018f0000-0000-7000-8000-000000000401';
  const itemPavBhaji = '018f0000-0000-7000-8000-000000000402';
  const itemSevPuri = '018f0000-0000-7000-8000-000000000403';
  const itemLassi = '018f0000-0000-7000-8000-000000000404';

  await db
    .insert(menuItems)
    .values([
      {
        id: itemPaniPuri,
        restaurantId: SEED_IDS.REST_KHAU_GALLI,
        categoryId: catChaats,
        name: 'Pani Puri (8 pcs)',
        description: 'Crispy puris with spiced potato filling, chilled mint water and sweet tamarind chutney.',
        pricePaise: 8000, // ₹80.00
        isVeg: true,
        isAvailable: true,
        sortOrder: 1,
      },
      {
        id: itemSevPuri,
        restaurantId: SEED_IDS.REST_KHAU_GALLI,
        categoryId: catChaats,
        name: 'Mumbai Sev Puri',
        description: 'Flat papdis topped with potatoes, trio of chutneys and crisp nylon sev.',
        pricePaise: 11000, // ₹110.00
        isVeg: true,
        isAvailable: true,
        sortOrder: 2,
      },
      {
        id: itemPavBhaji,
        restaurantId: SEED_IDS.REST_KHAU_GALLI,
        categoryId: catMains,
        name: 'Special Butter Pav Bhaji',
        description: 'Rich mashed mixed vegetable bhaji loaded with Amul butter, served with 2 soft toasted pavs.',
        pricePaise: 16000, // ₹160.00
        isVeg: true,
        isAvailable: true,
        sortOrder: 1,
      },
      {
        id: itemLassi,
        restaurantId: SEED_IDS.REST_KHAU_GALLI,
        categoryId: catDrinks,
        name: 'Sweet Masala Lassi',
        description: 'Thick creamy yoghurt churned with cardamom, topped with malai.',
        pricePaise: 9000, // ₹90.00
        isVeg: true,
        isAvailable: true,
        sortOrder: 1,
      },
    ])
    .onConflictDoUpdate({
      target: menuItems.id,
      set: {
        name: sql`EXCLUDED.name`,
        description: sql`EXCLUDED.description`,
        pricePaise: sql`EXCLUDED.price_paise`,
        isVeg: sql`EXCLUDED.is_veg`,
        isAvailable: sql`EXCLUDED.is_available`,
      },
    });

  // 7. Seed Hierarchical Modifier Groups & Options
  // Group 1 for Pav Bhaji: "Pav Options" (min: 0, max: 2)
  const grpPav = '018f0000-0000-7000-8000-000000000501';
  // Group 2 for Pav Bhaji: "Toppings & Extra Butter" (min: 0, max: 2)
  const grpToppings = '018f0000-0000-7000-8000-000000000502';
  // Group 1 for Pani Puri: "Spice Level" (min: 1, max: 1 - Mandatory)
  const grpSpice = '018f0000-0000-7000-8000-000000000503';

  await db
    .insert(modifierGroups)
    .values([
      {
        id: grpPav,
        menuItemId: itemPavBhaji,
        name: 'Pav Options',
        minSelections: 0,
        maxSelections: 2,
        sortOrder: 1,
      },
      {
        id: grpToppings,
        menuItemId: itemPavBhaji,
        name: 'Toppings & Extra Butter',
        minSelections: 0,
        maxSelections: 2,
        sortOrder: 2,
      },
      {
        id: grpSpice,
        menuItemId: itemPaniPuri,
        name: 'Spice Level',
        minSelections: 1,
        maxSelections: 1,
        sortOrder: 1,
      },
    ])
    .onConflictDoUpdate({
      target: modifierGroups.id,
      set: {
        name: sql`EXCLUDED.name`,
        minSelections: sql`EXCLUDED.min_selections`,
        maxSelections: sql`EXCLUDED.max_selections`,
      },
    });

  // Options for Pav Options
  const optExtraPavPair = '018f0000-0000-7000-8000-000000000601';
  const optSinglePav = '018f0000-0000-7000-8000-000000000602';

  // Options for Toppings
  const optExtraButter = '018f0000-0000-7000-8000-000000000603';
  const optExtraCheese = '018f0000-0000-7000-8000-000000000604';

  // Options for Spice Level
  const optMediumSpicy = '018f0000-0000-7000-8000-000000000605';
  const optTeekhaSpicy = '018f0000-0000-7000-8000-000000000606';
  const optMeethaSweet = '018f0000-0000-7000-8000-000000000607';

  await db
    .insert(modifierOptions)
    .values([
      { id: optExtraPavPair, modifierGroupId: grpPav, name: 'Extra Butter Pav (Pair)', pricePaise: 4000, isVeg: true, sortOrder: 1 },
      { id: optSinglePav, modifierGroupId: grpPav, name: 'Single Extra Pav', pricePaise: 2000, isVeg: true, sortOrder: 2 },
      { id: optExtraButter, modifierGroupId: grpToppings, name: 'Extra Amul Butter Cube', pricePaise: 2500, isVeg: true, sortOrder: 1 },
      { id: optExtraCheese, modifierGroupId: grpToppings, name: 'Grated Amul Cheese', pricePaise: 3500, isVeg: true, sortOrder: 2 },
      { id: optMediumSpicy, modifierGroupId: grpSpice, name: 'Medium Spicy (Regular)', pricePaise: 0, isVeg: true, sortOrder: 1 },
      { id: optTeekhaSpicy, modifierGroupId: grpSpice, name: 'Teekha / Extra Spicy', pricePaise: 0, isVeg: true, sortOrder: 2 },
      { id: optMeethaSweet, modifierGroupId: grpSpice, name: 'Meetha / Sweet Tamarind', pricePaise: 0, isVeg: true, sortOrder: 3 },
    ])
    .onConflictDoUpdate({
      target: modifierOptions.id,
      set: {
        name: sql`EXCLUDED.name`,
        pricePaise: sql`EXCLUDED.price_paise`,
      },
    });

  console.log('✓ Database seeded successfully and idempotently with Phase 1 catalog data!');
}

// Execute seed only when executed directly via CLI
if (process.argv[1]?.includes('seed')) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed execution error:', err);
      process.exit(1);
    });
}
