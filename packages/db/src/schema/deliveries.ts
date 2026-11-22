import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { orders } from './orders';
import { riders } from './riders';
import { geographyPoint } from './custom-types';

export const deliveries = pgTable(
  'deliveries',
  {
    id: uuid('id').primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    riderId: uuid('rider_id').references(() => riders.id, { onDelete: 'set null' }),
    status: varchar('status', { length: 30 }).notNull().default('PENDING_ASSIGNMENT'),
    pickupGeog: geographyPoint('pickup_geog').notNull(),
    dropoffGeog: geographyPoint('dropoff_geog').notNull(),
    pickupOtpHash: varchar('pickup_otp_hash', { length: 100 }).notNull(),
    deliveryOtpHash: varchar('delivery_otp_hash', { length: 100 }).notNull(),
    distanceMeters: integer('distance_meters').notNull().default(1000),
    payoutPaise: integer('payout_paise').notNull().default(4000),
    pickedUpAt: timestamp('picked_up_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_deliveries_order_id').on(table.orderId),
    index('idx_deliveries_rider_id').on(table.riderId),
    index('idx_deliveries_status').on(table.status),
  ]
);

export const deliveryOffers = pgTable(
  'delivery_offers',
  {
    id: uuid('id').primaryKey(),
    deliveryId: uuid('delivery_id')
      .notNull()
      .references(() => deliveries.id, { onDelete: 'cascade' }),
    riderId: uuid('rider_id')
      .notNull()
      .references(() => riders.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 30 }).notNull().default('OFFERED'),
    payoutPaise: integer('payout_paise').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_delivery_offers_delivery_rider').on(table.deliveryId, table.riderId),
    index('idx_delivery_offers_rider_status').on(table.riderId, table.status),
  ]
);

export type Delivery = typeof deliveries.$inferSelect;
export type NewDelivery = typeof deliveries.$inferInsert;
export type DeliveryOffer = typeof deliveryOffers.$inferSelect;
export type NewDeliveryOffer = typeof deliveryOffers.$inferInsert;
