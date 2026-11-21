import { db, restaurants, menuCategories, menuItems, modifierGroups, modifierOptions, outboxEvents, auditLog } from '@tiffin/db';
import { sql, eq, and, asc } from 'drizzle-orm';
import { generateUuidV7 } from '@tiffin/shared';

export interface CreateMenuItemInput {
  categoryId: string;
  name: string;
  description?: string;
  pricePaise: number;
  isVeg: boolean;
  imageUrl?: string;
}

export interface UpdateMenuItemInput {
  name?: string;
  description?: string;
  pricePaise?: number;
  isVeg?: boolean;
  imageUrl?: string;
}

export class RestaurantPortalService {
  /**
   * Get restaurant operational profile.
   */
  async getProfile(restaurantId: string) {
    const restaurant = await db.query.restaurants.findFirst({
      where: eq(restaurants.id, restaurantId),
    });

    if (!restaurant) {
      const err: any = new Error('Restaurant not found');
      err.statusCode = 404;
      throw err;
    }

    return restaurant;
  }

  /**
   * Toggle manual accepting orders state with audit trail and outbox event.
   */
  async updateStatus(
    restaurantId: string,
    acceptingOrders: boolean,
    actorId: string,
    actorRole: string
  ) {
    const existing = await db.query.restaurants.findFirst({
      where: eq(restaurants.id, restaurantId),
    });

    if (!existing) {
      const err: any = new Error('Restaurant not found');
      err.statusCode = 404;
      throw err;
    }

    await db.transaction(async (tx) => {
      // 1. Update restaurant accepting_orders
      await tx
        .update(restaurants)
        .set({
          acceptingOrders,
          updatedAt: new Date(),
        })
        .where(eq(restaurants.id, restaurantId));

      // 2. Write audit log
      await tx.insert(auditLog).values({
        id: generateUuidV7(),
        actorId,
        actorRole,
        action: 'UPDATE_ACCEPTING_ORDERS',
        entityType: 'RESTAURANT',
        entityId: restaurantId,
        diff: { previous: existing.acceptingOrders, current: acceptingOrders },
      });

      // 3. Write outbox event
      await tx.insert(outboxEvents).values({
        id: generateUuidV7(),
        aggregateType: 'RESTAURANT',
        aggregateId: restaurantId,
        eventType: 'RESTAURANT_ACCEPTING_ORDERS_TOGGLED',
        payload: { restaurantId, acceptingOrders },
      });
    });

    return { success: true, acceptingOrders };
  }

  /**
   * Fetch complete staff-view menu with stock availability indicators.
   */
  async getStaffMenu(restaurantId: string) {
    const categories = await db.query.menuCategories.findMany({
      where: eq(menuCategories.restaurantId, restaurantId),
      orderBy: [asc(menuCategories.sortOrder)],
    });

    const items = await db.query.menuItems.findMany({
      where: eq(menuItems.restaurantId, restaurantId),
      orderBy: [asc(menuItems.sortOrder)],
    });

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

    return categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      sortOrder: cat.sortOrder,
      items: items
        .filter((item) => item.categoryId === cat.id)
        .map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          pricePaise: item.pricePaise,
          isVeg: item.isVeg,
          isAvailable: item.isAvailable,
          imageUrl: item.imageUrl,
          modifierGroups: allGroups
            .filter((g) => g.menuItemId === item.id)
            .map((g) => ({
              id: g.id,
              name: g.name,
              minSelections: g.minSelections,
              maxSelections: g.maxSelections,
              options: allOptions.filter((o) => o.modifierGroupId === g.id),
            })),
        })),
    }));
  }

  /**
   * Instant out-of-stock toggle with IDOR ownership check and version cache bump.
   */
  async updateItemAvailability(
    restaurantId: string,
    itemId: string,
    isAvailable: boolean,
    actorId: string,
    actorRole: string
  ) {
    // IDOR Check
    const item = await db.query.menuItems.findFirst({
      where: eq(menuItems.id, itemId),
    });

    if (!item) {
      const err: any = new Error('Menu item not found');
      err.statusCode = 404;
      throw err;
    }

    if (item.restaurantId !== restaurantId) {
      const err: any = new Error('Forbidden: You do not have permission to modify items of another restaurant');
      err.statusCode = 403;
      throw err;
    }

    await db.transaction(async (tx) => {
      // 1. Update item stock status
      await tx
        .update(menuItems)
        .set({
          isAvailable,
          updatedAt: new Date(),
        })
        .where(eq(menuItems.id, itemId));

      // 2. Bump restaurant menu_version to invalidate Redis display cache
      await tx
        .update(restaurants)
        .set({
          menuVersion: sql`${restaurants.menuVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(restaurants.id, restaurantId));

      // 3. Insert audit log
      await tx.insert(auditLog).values({
        id: generateUuidV7(),
        actorId,
        actorRole,
        action: 'TOGGLE_ITEM_STOCK',
        entityType: 'MENU_ITEM',
        entityId: itemId,
        diff: { itemId, wasAvailable: item.isAvailable, isAvailable },
      });

      // 4. Insert outbox event
      await tx.insert(outboxEvents).values({
        id: generateUuidV7(),
        aggregateType: 'MENU_ITEM',
        aggregateId: itemId,
        eventType: 'ITEM_AVAILABILITY_CHANGED',
        payload: { itemId, restaurantId, isAvailable },
      });
    });

    return { success: true, itemId, isAvailable };
  }

  /**
   * Update item details (price, name, description) with IDOR check and audit logging.
   */
  async updateItem(
    restaurantId: string,
    itemId: string,
    input: UpdateMenuItemInput,
    actorId: string,
    actorRole: string
  ) {
    const item = await db.query.menuItems.findFirst({
      where: eq(menuItems.id, itemId),
    });

    if (!item) {
      const err: any = new Error('Menu item not found');
      err.statusCode = 404;
      throw err;
    }

    if (item.restaurantId !== restaurantId) {
      const err: any = new Error('Forbidden: Cannot modify item belonging to another restaurant');
      err.statusCode = 403;
      throw err;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(menuItems)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(menuItems.id, itemId));

      await tx
        .update(restaurants)
        .set({
          menuVersion: sql`${restaurants.menuVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(restaurants.id, restaurantId));

      await tx.insert(auditLog).values({
        id: generateUuidV7(),
        actorId,
        actorRole,
        action: 'UPDATE_MENU_ITEM',
        entityType: 'MENU_ITEM',
        entityId: itemId,
        diff: { before: item, after: input },
      });
    });

    return { success: true, itemId };
  }

  /**
   * Create new dish under a category.
   */
  async createItem(
    restaurantId: string,
    input: CreateMenuItemInput,
    actorId: string,
    actorRole: string
  ) {
    const newItemId = generateUuidV7();

    await db.transaction(async (tx) => {
      await tx.insert(menuItems).values({
        id: newItemId,
        restaurantId,
        categoryId: input.categoryId,
        name: input.name,
        description: input.description,
        pricePaise: input.pricePaise,
        isVeg: input.isVeg,
        isAvailable: true,
        imageUrl: input.imageUrl,
      });

      await tx
        .update(restaurants)
        .set({
          menuVersion: sql`${restaurants.menuVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(restaurants.id, restaurantId));

      await tx.insert(auditLog).values({
        id: generateUuidV7(),
        actorId,
        actorRole,
        action: 'CREATE_MENU_ITEM',
        entityType: 'MENU_ITEM',
        entityId: newItemId,
        diff: input,
      });
    });

    return { success: true, itemId: newItemId };
  }
}

export const restaurantPortalService = new RestaurantPortalService();
