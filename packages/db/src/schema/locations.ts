import { pgTable, uuid, varchar, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { geographyPoint, geographyPolygon } from './custom-types';
import { sql } from 'drizzle-orm';

export const serviceZones = pgTable(
  'service_zones',
  {
    id: uuid('id').primaryKey(),
    name: varchar('name', { length: 100 }).notNull(),
    boundary: geographyPolygon('boundary').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_service_zones_boundary').using('gist', table.boundary),
  ]
);

export const addresses = pgTable(
  'addresses',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 50 }).notNull(),
    line1: text('line1').notNull(),
    landmark: text('landmark'),
    geog: geographyPoint('geog').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_addresses_geog').using('gist', table.geog),
    index('idx_addresses_user_id').on(table.userId),
  ]
);

export type ServiceZone = typeof serviceZones.$inferSelect;
export type NewServiceZone = typeof serviceZones.$inferInsert;
export type Address = typeof addresses.$inferSelect;
export type NewAddress = typeof addresses.$inferInsert;
