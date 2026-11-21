import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  parseRupeesToPaise,
  formatPaiseToInr,
  calculateDeliveryFee,
  calculateCartQuote,
  DEFAULT_PRICING_RULES,
  CartItemQuoteInput,
} from '../src/pricing';

describe('Pure Pricing Engine & Property Tests', () => {
  describe('Text-based Rupee to Paise Parser', () => {
    it('eliminates floating point representation bugs for exact decimals', () => {
      // Classic JS float bug: 0.57 * 100 = 56.99999999999999
      expect(parseRupeesToPaise('0.57')).toBe(57);
      expect(parseRupeesToPaise('150.50')).toBe(15050);
      expect(parseRupeesToPaise('₹240.00')).toBe(24000);
      expect(parseRupeesToPaise('12.5')).toBe(1250);
      expect(parseRupeesToPaise('100')).toBe(10000);
    });

    it('formats paise to standard Indian Rupee string correctly', () => {
      expect(formatPaiseToInr(57)).toBe('₹0.57');
      expect(formatPaiseToInr(15050)).toBe('₹150.50');
      expect(formatPaiseToInr(24000)).toBe('₹240.00');
    });

    it('property test: parseRupeesToPaise strictly inverts for any valid decimal string', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100000 }),
          fc.integer({ min: 0, max: 99 }),
          (rupees, paise) => {
            const formatted = `${rupees}.${paise < 10 ? '0' + paise : paise}`;
            const expectedPaise = rupees * 100 + paise;
            expect(parseRupeesToPaise(formatted)).toBe(expectedPaise);
          }
        ),
        { numRuns: 1000 }
      );
    });
  });

  describe('Delivery Fee (Per Started Kilometer Rule)', () => {
    it('charges base fee of ₹30 (3000 paise) up to 2,000 meters', () => {
      expect(calculateDeliveryFee(0)).toBe(3000);
      expect(calculateDeliveryFee(1000)).toBe(3000);
      expect(calculateDeliveryFee(2000)).toBe(3000);
    });

    it('charges ₹10 (1000 paise) per started kilometer beyond 2 km', () => {
      // 2,001m starts 3rd kilometer -> ₹30 + ₹10 = ₹40
      expect(calculateDeliveryFee(2001)).toBe(4000);
      expect(calculateDeliveryFee(2500)).toBe(4000);
      expect(calculateDeliveryFee(3000)).toBe(4000);

      // 3,001m starts 4th kilometer -> ₹30 + ₹20 = ₹50
      expect(calculateDeliveryFee(3001)).toBe(5000);
      expect(calculateDeliveryFee(4000)).toBe(5000);
    });

    it('caps delivery fee at ₹150 (15000 paise)', () => {
      expect(calculateDeliveryFee(50000)).toBe(15000);
    });
  });

  describe('Fast-Check Quote Property Invariants', () => {
    it('parts always strictly sum to grand total and all values are integers', () => {
      const itemArbitrary = fc.record({
        menuItemId: fc.uuid(),
        name: fc.string({ minLength: 1, maxLength: 30 }),
        pricePaise: fc.integer({ min: 100, max: 50000 }),
        quantity: fc.integer({ min: 1, max: 10 }),
        isAvailable: fc.boolean(),
        selectedModifiers: fc.array(
          fc.record({
            modifierOptionId: fc.uuid(),
            name: fc.string({ minLength: 1, maxLength: 20 }),
            pricePaise: fc.integer({ min: 0, max: 5000 }),
          }),
          { maxLength: 4 }
        ),
      });

      fc.assert(
        fc.property(
          fc.array(itemArbitrary, { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 0, max: 30000 }),
          (items, distanceMeters) => {
            const quote = calculateCartQuote(
              {
                restaurantId: '018f0000-0000-7000-8000-000000000101',
                addressId: '018f0000-0000-7000-8000-000000000021',
                distanceMeters,
                items,
              },
              () => 'quote-test-uuid'
            );

            // Invariant 1: All financial fields are integers >= 0
            expect(Number.isInteger(quote.subtotalPaise)).toBe(true);
            expect(Number.isInteger(quote.foodGstPaise)).toBe(true);
            expect(Number.isInteger(quote.deliveryFeePaise)).toBe(true);
            expect(Number.isInteger(quote.platformFeePaise)).toBe(true);
            expect(Number.isInteger(quote.packagingFeePaise)).toBe(true);
            expect(Number.isInteger(quote.grandTotalPaise)).toBe(true);

            expect(quote.subtotalPaise).toBeGreaterThan(0);
            expect(quote.foodGstPaise).toBeGreaterThanOrEqual(0);
            expect(quote.deliveryFeePaise).toBeGreaterThanOrEqual(3000);
            expect(quote.platformFeePaise).toBe(500);

            // Invariant 2: Mathematical Sum Invariant
            const expectedGrandTotal =
              quote.subtotalPaise +
              quote.foodGstPaise +
              quote.deliveryFeePaise +
              quote.platformFeePaise +
              quote.packagingFeePaise -
              quote.discountPaise;

            expect(quote.grandTotalPaise).toBe(expectedGrandTotal);

            // Invariant 3: Expiry is 15 minutes into future
            const now = Date.now();
            const expires = new Date(quote.expiresAt).getTime();
            expect(expires - now).toBeGreaterThanOrEqual(14 * 60 * 1000);
            expect(expires - now).toBeLessThanOrEqual(16 * 60 * 1000);
          }
        ),
        { numRuns: 1000 }
      );
    });
  });
});
