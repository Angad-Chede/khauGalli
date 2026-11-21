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

export const modifierGroups = pgTable(
  'modifier_groups',
  {
    id: uuid('id').primaryKey(),
    menuItemId: uuid('menu_item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    minSelections: integer('min_selections').notNull().default(0),
    maxSelections: integer('max_selections').notNull().default(1),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_modifier_groups_item_id').on(table.menuItemId, table.sortOrder),
  ]
);

export const modifierOptions = pgTable(
  'modifier_options',
  {
    id: uuid('id').primaryKey(),
    modifierGroupId: uuid('modifier_group_id')
      .notNull()
      .references(() => modifierGroups.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    pricePaise: integer('price_paise').notNull().default(0),
    isVeg: boolean('is_veg').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_modifier_options_group_id').on(table.modifierGroupId, table.sortOrder),
  ]
);

export type MenuCategory = typeof menuCategories.$inferSelect;
export type NewMenuCategory = typeof menuCategories.$inferInsert;
export type MenuItem = typeof menuItems.$inferSelect;
export type NewMenuItem = typeof menuItems.$inferInsert;
export type ModifierGroup = typeof modifierGroups.$inferSelect;
export type NewModifierGroup = typeof modifierGroups.$inferInsert;
export type ModifierOption = typeof modifierOptions.$inferSelect;
export type NewModifierOption = typeof modifierOptions.$inferInsert;
