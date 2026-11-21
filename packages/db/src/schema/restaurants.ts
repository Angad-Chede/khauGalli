import { pgTable, uuid, varchar, text, boolean, integer, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users';
import { geographyPoint } from './custom-types';
import { sql } from 'drizzle-orm';

export const restaurants = pgTable(
  'restaurants',
  {
    id: uuid('id').primaryKey(),
    name: varchar('name', { length: 200 }).notNull(),
    slug: varchar('slug', { length: 200 }).notNull().unique(),
    description: text('description'),
    cuisineTypes: text('cuisine_types').array().notNull().$default(() => []),
    geog: geographyPoint('geog').notNull(),
    isOpen: boolean('is_open').notNull().default(true),
    operatingHours: jsonb('operating_hours').notNull().$default(() => ({})),
    prepTimeDefaultMinutes: integer('prep_time_default_minutes').notNull().default(20),
    commissionBps: integer('commission_bps').notNull().default(2000),
    gstin: varchar('gstin', { length: 20 }),
    fssaiLicNo: varchar('fssai_lic_no', { length: 30 }),
    status: varchar('status', { length: 20 }).notNull().default('APPROVED'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_restaurants_geog').using('gist', table.geog),
    index('idx_restaurants_name_trgm').using('gin', sql`${table.name} gin_trgm_ops`),
    index('idx_restaurants_status_open').on(table.status, table.isOpen),
  ]
);

export const restaurantStaff = pgTable(
  'restaurant_staff',
  {
    id: uuid('id').primaryKey(),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    staffRole: varchar('staff_role', { length: 30 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_restaurant_staff_unique').on(table.restaurantId, table.userId),
  ]
);

export type Restaurant = typeof restaurants.$inferSelect;
export type NewRestaurant = typeof restaurants.$inferInsert;
export type RestaurantStaff = typeof restaurantStaff.$inferSelect;
export type NewRestaurantStaff = typeof restaurantStaff.$inferInsert;
