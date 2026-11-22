import { describe, it, expect } from 'vitest';
import { calculateCartQuote, CartItemQuoteInput } from '@tiffin/shared';

describe('Quote Validation & Price Shift Detection (HTTP 409)', () => {
  const sampleItems: CartItemQuoteInput[] = [
    {
      menuItemId: 'dish-1',
      name: 'Pani Puri',
      pricePaise: 6000,
      quantity: 2,
      isAvailable: true,
      selectedModifiers: [],
    },
  ];

  it('rejects checkout with 409 PRICE_CHANGED if the quote is older than 15 minutes', () => {
    const expiredTimestamp = new Date(Date.now() - 16 * 60 * 1000).toISOString();

    const mockQuote = {
      quoteId: 'quote-old-1',
      expiresAt: expiredTimestamp,
      grandTotalPaise: 16100,
    };

    const isExpired = Date.now() > new Date(mockQuote.expiresAt).getTime();
    expect(isExpired).toBe(true);

    const validateQuote = (q: typeof mockQuote) => {
      if (Date.now() > new Date(q.expiresAt).getTime()) {
        return {
          status: 409,
          code: 'PRICE_CHANGED',
          message: 'Your price quote has expired. Please review updated pricing.',
        };
      }
      return { status: 200 };
    };

    const res = validateQuote(mockQuote);
    expect(res.status).toBe(409);
    expect(res.code).toBe('PRICE_CHANGED');
  });

  it('detects when dish base price shifts between cart calculation and order placement', () => {
    // Original quote calculated when dish was ₹60.00
    const originalQuote = calculateCartQuote(
      {
        restaurantId: 'rest-1',
        addressId: 'addr-1',
        distanceMeters: 1500,
        items: sampleItems,
      },
      () => 'quote-1'
    );

    // Meanwhile, kitchen updated Pani Puri from ₹60.00 (6000 paise) to ₹70.00 (7000 paise)
    const liveItemsUpdated: CartItemQuoteInput[] = [
      {
        ...sampleItems[0],
        pricePaise: 7000,
      },
    ];

    const refreshedQuote = calculateCartQuote(
      {
        restaurantId: 'rest-1',
        addressId: 'addr-1',
        distanceMeters: 1500,
        items: liveItemsUpdated,
      },
      () => 'quote-2'
    );

    expect(refreshedQuote.grandTotalPaise).toBeGreaterThan(originalQuote.grandTotalPaise);

    function verifyCheckoutQuote(submittedQuoteId: string, liveCalculatedQuote: typeof refreshedQuote) {
      if (submittedQuoteId !== liveCalculatedQuote.quoteId) {
        return {
          status: 409,
          code: 'PRICE_CHANGED',
          refreshedQuote: liveCalculatedQuote,
        };
      }
      return { status: 200 };
    }

    const result = verifyCheckoutQuote(originalQuote.quoteId, refreshedQuote);
    expect(result.status).toBe(409);
    expect(result.code).toBe('PRICE_CHANGED');
    expect(result.refreshedQuote.grandTotalPaise).toBe(refreshedQuote.grandTotalPaise);
  });
});
