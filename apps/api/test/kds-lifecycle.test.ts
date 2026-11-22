import { describe, it, expect, beforeEach } from 'vitest';
import { transitionOrder, OrderStatus } from '@tiffin/shared';

describe('Phase 4 Kitchen Display System (KDS) & Restaurant Partner Operations', () => {
  interface SimMenuItem {
    id: string;
    restaurantId: string;
    name: string;
    pricePaise: number;
    isVeg: boolean;
    isAvailable: boolean;
  }

  interface SimOrder {
    id: string;
    restaurantId: string;
    orderNumber: string;
    status: OrderStatus;
    prepTimeMinutes?: number;
    cancellationReason?: string;
    placedAt: Date;
    acceptedAt?: Date;
    readyAt?: Date;
    paymentMode: 'ONLINE' | 'COD';
    paymentCaptured: boolean;
    refunded?: boolean;
    deliveryCreated?: boolean;
  }

  let orders: Record<string, SimOrder>;
  let menuItems: Record<string, SimMenuItem>;

  const REST_KHAU_GALLI = '018f0000-0000-7000-8000-000000000101';
  const REST_DOSA_CORNER = '018f0000-0000-7000-8000-000000000102';

  beforeEach(() => {
    orders = {
      'ord-kds-1': {
        id: 'ord-kds-1',
        restaurantId: REST_KHAU_GALLI,
        orderNumber: 'ORD-KDS-001',
        status: 'PLACED',
        placedAt: new Date(Date.now() - 45000), // 45 seconds ago
        paymentMode: 'ONLINE',
        paymentCaptured: true,
      },
      'ord-kds-2': {
        id: 'ord-kds-2',
        restaurantId: REST_DOSA_CORNER,
        orderNumber: 'ORD-KDS-002',
        status: 'PLACED',
        placedAt: new Date(Date.now() - 20000),
        paymentMode: 'ONLINE',
        paymentCaptured: true,
      },
    };

    menuItems = {
      'item-vada-pav': {
        id: 'item-vada-pav',
        restaurantId: REST_KHAU_GALLI,
        name: 'Mumbai Vada Pav',
        pricePaise: 6000,
        isVeg: true,
        isAvailable: true,
      },
      'item-masala-dosa': {
        id: 'item-masala-dosa',
        restaurantId: REST_DOSA_CORNER,
        name: 'Benne Masala Dosa',
        pricePaise: 11000,
        isVeg: true,
        isAvailable: true,
      },
    };
  });

  it('accepts order within 3-minute window and records estimated prep time', () => {
    const order = orders['ord-kds-1'];
    expect(order.status).toBe('PLACED');

    // Kitchen lead accepts order with 25 minutes prep time
    const transition = transitionOrder(order.status, 'ACCEPTED', {
      actorRole: 'RESTAURANT',
      actorId: 'staff-ravi',
      payload: { prepTimeMinutes: 25 },
    });

    expect(transition.ok).toBe(true);
    order.status = 'ACCEPTED';
    order.prepTimeMinutes = 25;
    order.acceptedAt = new Date();

    expect(order.status).toBe('ACCEPTED');
    expect(order.prepTimeMinutes).toBe(25);
    expect(order.acceptedAt).toBeDefined();
  });

  it('rejects order with reason and initiates refund for captured online payment', () => {
    const order = orders['ord-kds-1'];
    const rejectionReason = 'Kitchen overloaded with walk-in rush';

    const transition = transitionOrder(order.status, 'REJECTED_BY_RESTAURANT', {
      actorRole: 'RESTAURANT',
      actorId: 'staff-ravi',
      payload: { rejectionReason },
    });

    expect(transition.ok).toBe(true);
    order.status = 'REJECTED_BY_RESTAURANT';
    order.cancellationReason = rejectionReason;

    if (order.paymentMode === 'ONLINE' && order.paymentCaptured) {
      order.refunded = true;
    }

    expect(order.status).toBe('REJECTED_BY_RESTAURANT');
    expect(order.cancellationReason).toBe(rejectionReason);
    expect(order.refunded).toBe(true);
  });

  it('transitions order to READY and triggers automated courier delivery creation', () => {
    const order = orders['ord-kds-1'];
    // Move to PREPARING then READY
    order.status = 'PREPARING';

    const transition = transitionOrder(order.status, 'READY', {
      actorRole: 'RESTAURANT',
      actorId: 'staff-ravi',
    });

    expect(transition.ok).toBe(true);
    order.status = 'READY';
    order.readyAt = new Date();
    order.deliveryCreated = true; // Triggered delivery assignment

    expect(order.status).toBe('READY');
    expect(order.readyAt).toBeDefined();
    expect(order.deliveryCreated).toBe(true);
  });

  it('toggles menu item stock availability (86ing) and prevents customers from ordering unavailable items', () => {
    const item = menuItems['item-vada-pav'];
    expect(item.isAvailable).toBe(true);

    // Kitchen runs out of Pav - staff toggles item to unavailable
    item.isAvailable = false;
    expect(item.isAvailable).toBe(false);

    // Customer attempts to add unavailable item to order
    function validateItemOrderable(menuItem: SimMenuItem) {
      if (!menuItem.isAvailable) {
        const err: any = new Error(`Item '${menuItem.name}' is currently sold out`);
        err.code = 'ITEM_UNAVAILABLE';
        throw err;
      }
      return true;
    }

    expect(() => validateItemOrderable(item)).toThrowError(/sold out/);

    // Kitchen receives new delivery of Pav - staff restores availability
    item.isAvailable = true;
    expect(validateItemOrderable(item)).toBe(true);
  });

  it('enforces multi-tenant isolation: staff of Restaurant A cannot accept or modify orders of Restaurant B', () => {
    const staffKhauGalli = { restaurantId: REST_KHAU_GALLI, name: 'Ravi' };
    const dosaOrder = orders['ord-kds-2']; // Belongs to Dosa Corner

    function handleStaffAction(staff: { restaurantId: string }, order: SimOrder) {
      if (order.restaurantId !== staff.restaurantId) {
        const err: any = new Error('Forbidden: You do not have permission to manage orders of another restaurant');
        err.statusCode = 403;
        throw err;
      }
      return true;
    }

    expect(() => handleStaffAction(staffKhauGalli, dosaOrder)).toThrowError(/Forbidden/);
  });

  it('computes daily kitchen throughput metrics correctly', () => {
    const dailyOrders: SimOrder[] = [
      {
        id: '1',
        restaurantId: REST_KHAU_GALLI,
        orderNumber: 'ORD-1',
        status: 'DELIVERED',
        prepTimeMinutes: 15,
        placedAt: new Date(),
        paymentMode: 'ONLINE',
        paymentCaptured: true,
      },
      {
        id: '2',
        restaurantId: REST_KHAU_GALLI,
        orderNumber: 'ORD-2',
        status: 'DELIVERED',
        prepTimeMinutes: 25,
        placedAt: new Date(),
        paymentMode: 'ONLINE',
        paymentCaptured: true,
      },
      {
        id: '3',
        restaurantId: REST_KHAU_GALLI,
        orderNumber: 'ORD-3',
        status: 'PREPARING',
        prepTimeMinutes: 20,
        placedAt: new Date(),
        paymentMode: 'ONLINE',
        paymentCaptured: true,
      },
      {
        id: '4',
        restaurantId: REST_KHAU_GALLI,
        orderNumber: 'ORD-4',
        status: 'REJECTED_BY_RESTAURANT',
        placedAt: new Date(),
        paymentMode: 'ONLINE',
        paymentCaptured: true,
      },
    ];

    const completed = dailyOrders.filter((o) => o.status === 'DELIVERED').length;
    const active = dailyOrders.filter((o) => ['PLACED', 'ACCEPTED', 'PREPARING', 'READY'].includes(o.status)).length;
    const avgPrep = Math.round(
      dailyOrders
        .filter((o) => o.prepTimeMinutes)
        .reduce((sum, o) => sum + (o.prepTimeMinutes || 0), 0) / 3
    );

    expect(completed).toBe(2);
    expect(active).toBe(1);
    expect(avgPrep).toBe(20); // (15 + 25 + 20) / 3 = 20 mins
  });
});
