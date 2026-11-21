import { pgTable, uuid, varchar, text, boolean, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { restaurants } from './restaurants';
import { sql } from 'drizzle-orm';

export const menuCategories = pgTable(
  'menu_categories',
  {
    id: uuid('id').primaryKey(),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_menu_categories_restaurant_id').on(table.restaurantId, table.sortOrder),
  ]
);

export const menuItems = pgTable(
  'menu_items',
  {
    id: uuid('id').primaryKey(),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => menuCategories.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    pricePaise: integer('price_paise').notNull(),
    isVeg: boolean('is_veg').notNull().default(true),
    isAvailable: boolean('is_available').notNull().default(true),
    imageUrl: text('image_url'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_menu_items_name_trgm').using('gin', sql`${table.name} gin_trgm_ops`),
    index('idx_menu_items_restaurant_available').on(table.restaurantId, table.isAvailable),
    index('idx_menu_items_category_id').on(table.categoryId, table.sortOrder),
  ]
);

export const itemModifiers = pgTable(
  'item_modifiers',
  {
    id: uuid('id').primaryKey(),
    menuItemId: uuid('menu_item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    pricePaise: integer('price_paise').notNull().default(0),
    isVeg: boolean('is_veg').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_item_modifiers_item_id').on(table.menuItemId),
  ]
);

export type MenuCategory = typeof menuCategories.$inferSelect;
export type NewMenuCategory = typeof menuCategories.$inferInsert;
export type MenuItem = typeof menuItems.$inferSelect;
export type NewMenuItem = typeof menuItems.$inferInsert;
export type ItemModifier = typeof itemModifiers.$inferSelect;
export type NewItemModifier = typeof itemModifiers.$inferInsert;
