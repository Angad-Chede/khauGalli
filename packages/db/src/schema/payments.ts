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
import { orders } from './orders';

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey(),
    orderId: uuid('order_id').notNull().references(() => orders.id),
    razorpayOrderId: varchar('razorpay_order_id', { length: 100 }),
    razorpayPaymentId: varchar('razorpay_payment_id', { length: 100 }),
    amountPaise: integer('amount_paise').notNull(),
    currency: varchar('currency', { length: 10 }).notNull().default('INR'),
    status: varchar('status', { length: 30 }).notNull().default('PENDING'),
    errorCode: text('error_code'),
    errorDescription: text('error_description'),
    rawWebhookPayload: jsonb('raw_webhook_payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_payments_order_id').on(table.orderId),
    index('idx_payments_razorpay_order_id').on(table.razorpayOrderId),
    index('idx_payments_razorpay_payment_id').on(table.razorpayPaymentId),
    index('idx_payments_status').on(table.status),
  ]
);

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey(),
    provider: varchar('provider', { length: 30 }).notNull().default('RAZORPAY'),
    providerEventId: varchar('provider_event_id', { length: 100 }).notNull(),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_webhook_events_provider_event').on(table.provider, table.providerEventId),
    index('idx_webhook_events_processed_at').on(table.processedAt),
  ]
);

export const refunds = pgTable(
  'refunds',
  {
    id: uuid('id').primaryKey(),
    orderId: uuid('order_id').notNull().references(() => orders.id),
    paymentId: uuid('payment_id').references(() => payments.id),
    amountPaise: integer('amount_paise').notNull(),
    reason: text('reason').notNull(),
    providerRefundId: varchar('provider_refund_id', { length: 100 }),
    status: varchar('status', { length: 30 }).notNull().default('PROCESSED'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_refunds_order_id').on(table.orderId),
    index('idx_refunds_payment_id').on(table.paymentId),
  ]
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;
export type Refund = typeof refunds.$inferSelect;
export type NewRefund = typeof refunds.$inferInsert;
