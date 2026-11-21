import { db, restaurants, addresses, menuItems, modifierGroups, modifierOptions } from '@tiffin/db';
import { sql, eq, and } from 'drizzle-orm';
import { redis } from '../../lib/redis';
import {
  calculateCartQuote,
  CartItemQuoteInput,
  CartQuoteResult,
  generateUuidV7,
} from '@tiffin/shared';

export interface CartItemInput {
  menuItemId: string;
  quantity: number;
  selectedModifierOptionIds?: string[];
}

export interface UpdateCartInput {
  restaurantId: string;
  addressId: string;
  items: CartItemInput[];
  replaceExisting?: boolean;
}

export class CartService {
  private getCartKey(userId: string): string {
    return `cart:${userId}`;
  }

  /**
   * Fetch active cart from Redis and re-check live PostgreSQL availability.
   */
  async getCart(userId: string): Promise<{ cart: any | null; quote: CartQuoteResult | null }> {
    const rawCart = await redis.get(this.getCartKey(userId));
    if (!rawCart) {
      return { cart: null, quote: null };
    }

    const cartData = JSON.parse(rawCart);
    if (!cartData.items || cartData.items.length === 0) {
      return { cart: null, quote: null };
    }

    // Live re-check from PostgreSQL
    const itemIds = cartData.items.map((i: any) => i.menuItemId);
    const dbItems = await db.query.menuItems.findMany({
      where: sql`${menuItems.id} = ANY(${itemIds})`,
    });

    const restaurant = await db.query.restaurants.findFirst({
      where: eq(restaurants.id, cartData.restaurantId),
    });

    const userAddress = await db.query.addresses.findFirst({
      where: eq(addresses.id, cartData.addressId),
    });

    if (!restaurant || !userAddress) {
      await redis.del(this.getCartKey(userId));
      return { cart: null, quote: null };
    }

    // Distance calculation
    const distResult = await db.execute(sql`
      SELECT ROUND(ST_Distance(
        ${restaurant.geog}::geography,
        ${userAddress.geog}::geography
      )) AS distance_meters
    `);
    const distanceMeters = Number(distResult.rows[0]?.distance_meters || 1000);

    // Fetch modifier options
    const allOptionIds: string[] = [];
    cartData.items.forEach((item: any) => {
      if (item.selectedModifierOptionIds) {
        allOptionIds.push(...item.selectedModifierOptionIds);
      }
    });

    let dbOptions: any[] = [];
    if (allOptionIds.length > 0) {
      dbOptions = await db.query.modifierOptions.findMany({
        where: sql`${modifierOptions.id} = ANY(${allOptionIds})`,
      });
    }

    const quoteItemsInput: CartItemQuoteInput[] = cartData.items.map((cartItem: any) => {
      const liveItem = dbItems.find((d) => d.id === cartItem.menuItemId);
      const isAvailable = liveItem ? liveItem.isAvailable : false;
      const unitPrice = liveItem ? liveItem.pricePaise : 0;
      const itemName = liveItem ? liveItem.name : 'Unknown Dish';

      const selectedMods = (cartItem.selectedModifierOptionIds || []).map((optId: string) => {
        const liveOpt = dbOptions.find((o) => o.id === optId);
        return {
          modifierOptionId: optId,
          name: liveOpt ? liveOpt.name : 'Modifier',
          pricePaise: liveOpt ? liveOpt.pricePaise : 0,
        };
      });

      return {
        menuItemId: cartItem.menuItemId,
        name: itemName,
        pricePaise: unitPrice,
        quantity: cartItem.quantity,
        isAvailable,
        selectedModifiers: selectedMods,
      };
    });

    const quote = calculateCartQuote(
      {
        restaurantId: cartData.restaurantId,
        addressId: cartData.addressId,
        distanceMeters,
        items: quoteItemsInput,
      },
      () => generateUuidV7()
    );

    return {
      cart: cartData,
      quote,
    };
  }

  /**
   * Update active cart with single-restaurant enforcement and modifier validation.
   */
  async updateCart(userId: string, input: UpdateCartInput): Promise<{ quote: CartQuoteResult }> {
    // 1. Single-restaurant rule check
    const existingRaw = await redis.get(this.getCartKey(userId));
    if (existingRaw) {
      try {
        const existingCart = JSON.parse(existingRaw);
        if (
          existingCart.restaurantId &&
          existingCart.restaurantId !== input.restaurantId &&
          !input.replaceExisting
        ) {
          const [currentRest, newRest] = await Promise.all([
            db.query.restaurants.findFirst({ where: eq(restaurants.id, existingCart.restaurantId) }),
            db.query.restaurants.findFirst({ where: eq(restaurants.id, input.restaurantId) }),
          ]);

          const conflictError: any = new Error(
            `Your cart contains items from ${currentRest?.name || 'another restaurant'}.`
          );
          conflictError.statusCode = 409;
          conflictError.code = 'RESTAURANT_CONFLICT';
          conflictError.currentRestaurant = {
            id: existingCart.restaurantId,
            name: currentRest?.name || 'Previous Restaurant',
          };
          conflictError.newRestaurant = {
            id: input.restaurantId,
            name: newRest?.name || 'Selected Restaurant',
          };
          throw conflictError;
        }
      } catch (err: any) {
        if (err.statusCode === 409) throw err;
      }
    }

    // 2. Verify restaurant is accepting orders
    const restaurant = await db.query.restaurants.findFirst({
      where: eq(restaurants.id, input.restaurantId),
    });
    if (!restaurant) {
      const err: any = new Error('Restaurant not found');
      err.statusCode = 404;
      throw err;
    }
    if (!restaurant.isOpen || !restaurant.acceptingOrders) {
      const err: any = new Error('Restaurant is currently paused and not accepting orders');
      err.statusCode = 400;
      throw err;
    }

    // 3. Verify delivery address serviceability
    const address = await db.query.addresses.findFirst({
      where: and(eq(addresses.id, input.addressId), eq(addresses.userId, userId)),
    });
    if (!address) {
      const err: any = new Error('Delivery address not found or does not belong to user');
      err.statusCode = 400;
      throw err;
    }

    const distCheck = await db.execute(sql`
      SELECT
        ROUND(ST_Distance(
          ${restaurant.geog}::geography,
          ${address.geog}::geography
        )) AS distance_meters,
        ST_DWithin(
          ${restaurant.geog}::geography,
          ${address.geog}::geography,
          ${restaurant.deliveryRadiusMeters}
        ) AS is_within_radius
    `);

    const distanceMeters = Number(distCheck.rows[0]?.distance_meters || 1000);
    const isWithinRadius = Boolean(distCheck.rows[0]?.is_within_radius);

    if (!isWithinRadius) {
      const err: any = new Error(
        `Address is outside restaurant delivery radius (${(restaurant.deliveryRadiusMeters / 1000).toFixed(1)} km).`
      );
      err.statusCode = 400;
      throw err;
    }

    // 4. Fetch menu items & modifier groups for validation
    const itemIds = input.items.map((i) => i.menuItemId);
    const dbItems = await db.query.menuItems.findMany({
      where: and(
        sql`${menuItems.id} = ANY(${itemIds})`,
        eq(menuItems.restaurantId, input.restaurantId)
      ),
    });

    if (dbItems.length !== itemIds.length) {
      const err: any = new Error('One or more items do not belong to this restaurant');
      err.statusCode = 400;
      throw err;
    }

    const dbGroups = await db.query.modifierGroups.findMany({
      where: sql`${modifierGroups.menuItemId} = ANY(${itemIds})`,
    });

    const groupIds = dbGroups.map((g) => g.id);
    let dbOptions: any[] = [];
    if (groupIds.length > 0) {
      dbOptions = await db.query.modifierOptions.findMany({
        where: sql`${modifierOptions.modifierGroupId} = ANY(${groupIds})`,
      });
    }

    // 5. Validate modifier group min/max rules
    const quoteItemsInput: CartItemQuoteInput[] = [];

    for (const itemInput of input.items) {
      const itemRecord = dbItems.find((i) => i.id === itemInput.menuItemId)!;
      const itemGroups = dbGroups.filter((g) => g.menuItemId === itemInput.menuItemId);
      const selectedOptionIds = itemInput.selectedModifierOptionIds || [];

      // Verify each group selection constraints
      for (const group of itemGroups) {
        const groupOptions = dbOptions.filter((o) => o.modifierGroupId === group.id);
        const groupOptionIds = groupOptions.map((o) => o.id);
        const selectionsInGroup = selectedOptionIds.filter((id) => groupOptionIds.includes(id));

        if (selectionsInGroup.length < group.minSelections) {
          const err: any = new Error(
            `Item '${itemRecord.name}' requires at least ${group.minSelections} selection for '${group.name}'`
          );
          err.statusCode = 400;
          throw err;
        }

        if (selectionsInGroup.length > group.maxSelections) {
          const err: any = new Error(
            `Item '${itemRecord.name}' allows at most ${group.maxSelections} selection(s) for '${group.name}'`
          );
          err.statusCode = 400;
          throw err;
        }
      }

      // Check for rogue option IDs
      const itemGroupOptionIds = dbOptions
        .filter((o) => itemGroups.some((g) => g.id === o.modifierGroupId))
        .map((o) => o.id);

      for (const optId of selectedOptionIds) {
        if (!itemGroupOptionIds.includes(optId)) {
          const err: any = new Error(`Modifier option does not belong to dish '${itemRecord.name}'`);
          err.statusCode = 400;
          throw err;
        }
      }

      const selectedMods = selectedOptionIds.map((optId) => {
        const opt = dbOptions.find((o) => o.id === optId)!;
        return {
          modifierOptionId: opt.id,
          name: opt.name,
          pricePaise: opt.pricePaise,
        };
      });

      quoteItemsInput.push({
        menuItemId: itemRecord.id,
        name: itemRecord.name,
        pricePaise: itemRecord.pricePaise,
        quantity: itemInput.quantity,
        isAvailable: itemRecord.isAvailable,
        selectedModifiers: selectedMods,
      });
    }

    // 6. Compute 15-minute priced quote
    const quote = calculateCartQuote(
      {
        restaurantId: input.restaurantId,
        addressId: input.addressId,
        distanceMeters,
        items: quoteItemsInput,
      },
      () => generateUuidV7()
    );

    // 7. Persist cart to Redis with 60-min TTL
    const cartToSave = {
      restaurantId: input.restaurantId,
      addressId: input.addressId,
      items: input.items,
      quoteId: quote.quoteId,
      version: Date.now(),
    };

    await redis.set(this.getCartKey(userId), JSON.stringify(cartToSave), 'EX', 3600);

    return { quote };
  }

  /**
   * Clear active cart from Redis.
   */
  async clearCart(userId: string): Promise<void> {
    await redis.del(this.getCartKey(userId));
  }
}

export const cartService = new CartService();
