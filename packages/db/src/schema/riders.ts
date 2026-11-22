import {
  pgTable,
  uuid,
  varchar,
  boolean,
  numeric,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { geographyPoint } from './custom-types';

export const riders = pgTable(
  'riders',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    vehicleType: varchar('vehicle_type', { length: 30 }).notNull().default('MOTORCYCLE'),
    vehicleNumber: varchar('vehicle_number', { length: 30 }),
    kycStatus: varchar('kyc_status', { length: 30 }).notNull().default('VERIFIED'),
    isOnline: boolean('is_online').notNull().default(false),
    isBusy: boolean('is_busy').notNull().default(false),
    ratingAverage: numeric('rating_average', { precision: 3, scale: 2 }).notNull().default('4.80'),
    ratingCount: integer('rating_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_riders_user_id').on(table.userId),
    index('idx_riders_availability').on(table.isOnline, table.isBusy),
  ]
);

export const riderCurrentLocation = pgTable(
  'rider_current_location',
  {
    riderId: uuid('rider_id')
      .primaryKey()
      .references(() => riders.id, { onDelete: 'cascade' }),
    geog: geographyPoint('geog').notNull(),
    headingDegrees: integer('heading_degrees'),
    speedKmh: numeric('speed_kmh', { precision: 4, scale: 1 }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_rider_current_location_geog').using('gist', table.geog),
  ]
);

export type Rider = typeof riders.$inferSelect;
export type NewRider = typeof riders.$inferInsert;
export type RiderCurrentLocation = typeof riderCurrentLocation.$inferSelect;
export type NewRiderCurrentLocation = typeof riderCurrentLocation.$inferInsert;
