import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { restaurants } from './restaurants';
import { menuItems } from './menus';

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey(),
    orderNumber: varchar('order_number', { length: 50 }).notNull().unique(),
    userId: uuid('user_id').notNull().references(() => users.id),
    restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id),
    addressSnapshot: jsonb('address_snapshot').notNull(),
    status: varchar('status', { length: 30 }).notNull().default('CREATED'),
    paymentMode: varchar('payment_mode', { length: 20 }).notNull().default('ONLINE'),
    idempotencyKey: varchar('idempotency_key', { length: 100 }).notNull(),
    subtotalPaise: integer('subtotal_paise').notNull(),
    taxPaise: integer('tax_paise').notNull(),
    deliveryFeePaise: integer('delivery_fee_paise').notNull(),
    platformFeePaise: integer('platform_fee_paise').notNull(),
    packagingFeePaise: integer('packaging_fee_paise').notNull(),
    discountPaise: integer('discount_paise').notNull().default(0),
    grandTotalPaise: integer('grand_total_paise').notNull(),
    prepTimeMinutes: integer('prep_time_minutes'),
    cancellationReason: text('cancellation_reason'),
    customerNotes: text('customer_notes'),
    placedAt: timestamp('placed_at', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_orders_user_idempotency').on(table.userId, table.idempotencyKey),
    index('idx_orders_restaurant_status_created').on(table.restaurantId, table.status, table.createdAt),
    index('idx_orders_user_created').on(table.userId, table.createdAt),
    index('idx_orders_status').on(table.status),
  ]
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey(),
    orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
    menuItemId: uuid('menu_item_id').references(() => menuItems.id),
    itemSnapshot: jsonb('item_snapshot').notNull(),
    quantity: integer('quantity').notNull(),
    unitPricePaise: integer('unit_price_paise').notNull(),
    modifiersTotalPaise: integer('modifiers_total_paise').notNull().default(0),
    lineTotalPaise: integer('line_total_paise').notNull(),
    selectedModifiersSnapshot: jsonb('selected_modifiers_snapshot'),
  },
  (table) => [
    index('idx_order_items_order_id').on(table.orderId),
  ]
);

export const orderEvents = pgTable(
  'order_events',
  {
    id: uuid('id').primaryKey(),
    orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
    fromStatus: varchar('from_status', { length: 30 }),
    toStatus: varchar('to_status', { length: 30 }).notNull(),
    actorRole: varchar('actor_role', { length: 30 }).notNull(),
    actorId: uuid('actor_id'),
    payload: jsonb('payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_order_events_order_created').on(table.orderId, table.createdAt),
  ]
);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
export type OrderEvent = typeof orderEvents.$inferSelect;
export type NewOrderEvent = typeof orderEvents.$inferInsert;
