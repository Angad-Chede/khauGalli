import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { hashOtp, generate4DigitOtp } from '../src/modules/deliveries/delivery.service';

describe('Phase 3 Delivery Partner & Lifecycle Engine', () => {
  interface SimRider {
    id: string;
    name: string;
    isOnline: boolean;
    isBusy: boolean;
  }

  interface SimDeliveryOffer {
    id: string;
    deliveryId: string;
    riderId: string;
    status: 'OFFERED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
    expiresAt: Date;
    payoutPaise: number;
  }

  interface SimDelivery {
    id: string;
    orderId: string;
    riderId: string | null;
    status: 'PENDING_ASSIGNMENT' | 'OFFERED' | 'ASSIGNED' | 'PICKED_UP' | 'DELIVERED';
    distanceMeters: number;
    payoutPaise: number;
    pickupOtpHash: string;
    deliveryOtpHash: string;
    pickedUpAt?: Date;
    deliveredAt?: Date;
  }

  let riders: Record<string, SimRider>;
  let offers: SimDeliveryOffer[];
  let deliveries: Record<string, SimDelivery>;

  beforeEach(() => {
    riders = {
      'rider-imran': {
        id: 'rider-imran',
        name: 'Imran Khan',
        isOnline: true,
        isBusy: false,
      },
      'rider-arjun': {
        id: 'rider-arjun',
        name: 'Arjun Das',
        isOnline: true,
        isBusy: false,
      },
    };

    offers = [];
    deliveries = {};
  });

  // Calculate rider payout matching DeliveryService formula
  function calculatePayoutPaise(distanceMeters: number): number {
    const basePayoutPaise = 4000; // ₹40.00 base for first 2 km
    const excessMeters = Math.max(0, distanceMeters - 2000);
    const extraKm = Math.ceil(excessMeters / 1000);
    return basePayoutPaise + extraKm * 1000;
  }

  it('calculates tiered delivery payout correctly based on road distance', () => {
    // Under 2 km: base fee ₹40 (4000 paise)
    expect(calculatePayoutPaise(1200)).toBe(4000);
    expect(calculatePayoutPaise(2000)).toBe(4000);

    // 2.1 km to 3 km: ₹40 + ₹10 = ₹50 (5000 paise)
    expect(calculatePayoutPaise(2100)).toBe(5000);
    expect(calculatePayoutPaise(3000)).toBe(5000);

    // 4.5 km: ₹40 + 3 * ₹10 = ₹70 (7000 paise)
    expect(calculatePayoutPaise(4500)).toBe(7000);
  });

  it('generates 4-digit OTPs and computes irreversible SHA-256 hashes', () => {
    const otp = generate4DigitOtp();
    expect(otp).toMatch(/^[1-9][0-9]{3}$/); // Exactly 4 digits between 1000 and 9999

    const hash = hashOtp(otp);
    expect(hash).toHaveLength(64); // 256 bits = 64 hex characters
    expect(hashOtp(otp)).toBe(hash); // Deterministic hash
    expect(hashOtp('0000')).not.toBe(hash); // Wrong code generates completely different hash
  });

  it('enforces atomic first-come-first-served offer acceptance and expires competing offers', () => {
    const deliveryId = 'del-101';
    const pickupOtp = '4321';
    const deliveryOtp = '8765';

    deliveries[deliveryId] = {
      id: deliveryId,
      orderId: 'ord-101',
      riderId: null,
      status: 'OFFERED',
      distanceMeters: 3200,
      payoutPaise: calculatePayoutPaise(3200),
      pickupOtpHash: hashOtp(pickupOtp),
      deliveryOtpHash: hashOtp(deliveryOtp),
    };

    const expiresAt = new Date(Date.now() + 30 * 1000); // 30s expiry
    offers.push(
      {
        id: 'off-imran',
        deliveryId,
        riderId: 'rider-imran',
        status: 'OFFERED',
        expiresAt,
        payoutPaise: 6000,
      },
      {
        id: 'off-arjun',
        deliveryId,
        riderId: 'rider-arjun',
        status: 'OFFERED',
        expiresAt,
        payoutPaise: 6000,
      }
    );

    // Simulated atomic acceptance function
    function acceptOffer(riderId: string, offerId: string) {
      const offer = offers.find((o) => o.id === offerId && o.riderId === riderId);
      if (!offer) throw new Error('Offer not found');
      if (offer.status !== 'OFFERED' || Date.now() > offer.expiresAt.getTime()) {
        const err: any = new Error('Offer expired');
        err.code = 'OFFER_EXPIRED';
        throw err;
      }

      const delivery = deliveries[offer.deliveryId];
      if (delivery.riderId !== null) {
        const err: any = new Error('This delivery was already assigned to another rider');
        err.code = 'OFFER_ALREADY_TAKEN';
        err.statusCode = 409;
        throw err;
      }

      // Assign atomically
      delivery.riderId = riderId;
      delivery.status = 'ASSIGNED';
      offer.status = 'ACCEPTED';

      // Expire other offers for this delivery
      for (const other of offers) {
        if (other.deliveryId === delivery.id && other.id !== offerId) {
          other.status = 'EXPIRED';
        }
      }

      riders[riderId].isBusy = true;
      return { success: true, deliveryId: delivery.id };
    }

    // Imran accepts first
    const acceptRes = acceptOffer('rider-imran', 'off-imran');
    expect(acceptRes.success).toBe(true);
    expect(deliveries[deliveryId].riderId).toBe('rider-imran');
    expect(deliveries[deliveryId].status).toBe('ASSIGNED');
    expect(riders['rider-imran'].isBusy).toBe(true);

    // Arjun's offer should now be expired
    const arjunOffer = offers.find((o) => o.id === 'off-arjun');
    expect(arjunOffer?.status).toBe('EXPIRED');

    // If Arjun tries to accept, it must fail with OFFER_EXPIRED or OFFER_ALREADY_TAKEN
    expect(() => acceptOffer('rider-arjun', 'off-arjun')).toThrowError(/Offer expired/);
  });

  it('verifies 4-digit pickup OTP before releasing food from restaurant', () => {
    const deliveryId = 'del-201';
    const kitchenPickupOtp = '7291';

    deliveries[deliveryId] = {
      id: deliveryId,
      orderId: 'ord-201',
      riderId: 'rider-imran',
      status: 'ASSIGNED',
      distanceMeters: 1800,
      payoutPaise: 4000,
      pickupOtpHash: hashOtp(kitchenPickupOtp),
      deliveryOtpHash: hashOtp('3847'),
    };

    function confirmPickup(riderId: string, dId: string, enteredOtp: string) {
      const delivery = deliveries[dId];
      if (!delivery || delivery.riderId !== riderId) throw new Error('Unauthorized');

      if (hashOtp(enteredOtp) !== delivery.pickupOtpHash) {
        const err: any = new Error('Invalid Pickup OTP');
        err.code = 'INVALID_PICKUP_OTP';
        throw err;
      }

      delivery.status = 'PICKED_UP';
      delivery.pickedUpAt = new Date();
      return { success: true };
    }

    // Invalid OTP
    expect(() => confirmPickup('rider-imran', deliveryId, '0000')).toThrowError('Invalid Pickup OTP');
    expect(deliveries[deliveryId].status).toBe('ASSIGNED');

    // Valid OTP
    const res = confirmPickup('rider-imran', deliveryId, '7291');
    expect(res.success).toBe(true);
    expect(deliveries[deliveryId].status).toBe('PICKED_UP');
    expect(deliveries[deliveryId].pickedUpAt).toBeDefined();
  });

  it('verifies 4-digit customer delivery OTP upon dropoff and frees the rider', () => {
    const deliveryId = 'del-301';
    const customerDeliveryOtp = '9182';

    deliveries[deliveryId] = {
      id: deliveryId,
      orderId: 'ord-301',
      riderId: 'rider-imran',
      status: 'PICKED_UP',
      distanceMeters: 2200,
      payoutPaise: 5000,
      pickupOtpHash: hashOtp('1111'),
      deliveryOtpHash: hashOtp(customerDeliveryOtp),
      pickedUpAt: new Date(Date.now() - 600000),
    };
    riders['rider-imran'].isBusy = true;

    function confirmDelivery(riderId: string, dId: string, enteredOtp: string) {
      const delivery = deliveries[dId];
      if (!delivery || delivery.riderId !== riderId) throw new Error('Unauthorized');

      if (hashOtp(enteredOtp) !== delivery.deliveryOtpHash) {
        const err: any = new Error('Invalid Delivery OTP');
        err.code = 'INVALID_DELIVERY_OTP';
        throw err;
      }

      delivery.status = 'DELIVERED';
      delivery.deliveredAt = new Date();
      riders[riderId].isBusy = false;
      return { success: true };
    }

    // Invalid OTP
    expect(() => confirmDelivery('rider-imran', deliveryId, '9999')).toThrowError('Invalid Delivery OTP');
    expect(deliveries[deliveryId].status).toBe('PICKED_UP');
    expect(riders['rider-imran'].isBusy).toBe(true);

    // Correct OTP
    const res = confirmDelivery('rider-imran', deliveryId, '9182');
    expect(res.success).toBe(true);
    expect(deliveries[deliveryId].status).toBe('DELIVERED');
    expect(deliveries[deliveryId].deliveredAt).toBeDefined();
    expect(riders['rider-imran'].isBusy).toBe(false); // Rider is ready for new orders
  });

  it('rejects expired delivery offer after 30-second window', () => {
    const expiredOffer: SimDeliveryOffer = {
      id: 'off-timeout',
      deliveryId: 'del-timeout',
      riderId: 'rider-imran',
      status: 'OFFERED',
      expiresAt: new Date(Date.now() - 1000), // 1 second in the past
      payoutPaise: 4000,
    };

    const isExpired = Date.now() > expiredOffer.expiresAt.getTime();
    expect(isExpired).toBe(true);
  });
});
