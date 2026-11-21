/**
 * Pure Pricing Engine for Tiffin (KhauGalli)
 * Handles all currency math strictly in integer paise.
 */

export interface PricingRules {
  version: number;
  baseDeliveryFeePaise: number; // 3000 = ₹30.00
  baseDeliveryDistanceMeters: number; // 2000 = 2 km
  distanceFeePerStartedKmPaise: number; // 1000 = ₹10.00 per started km
  maxDeliveryFeePaise: number; // 15000 = ₹150.00 max cap
  platformFeePaise: number; // 500 = ₹5.00
  foodGstBps: number; // 500 = 5.00%
  packagingFeePaise: number; // 0 default
}

export const DEFAULT_PRICING_RULES: PricingRules = {
  version: 1,
  baseDeliveryFeePaise: 3000, // ₹30.00
  baseDeliveryDistanceMeters: 2000, // 2 km
  distanceFeePerStartedKmPaise: 1000, // ₹10.00 / started km
  maxDeliveryFeePaise: 15000, // ₹150.00
  platformFeePaise: 500, // ₹5.00
  foodGstBps: 500, // 5% GST on prepared food
  packagingFeePaise: 0,
};

/**
 * Parses rupee string or number to integer paise using text-based splitting
 * to prevent JavaScript floating-point representation bugs (e.g. 0.57 * 100 = 56.99999999999999).
 */
export function parseRupeesToPaise(val: string | number): number {
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return 0;
    // Format to 2 decimal places string to sanitize float
    val = val.toFixed(2);
  }

  const clean = val.replace(/[₹,\s]/g, '').trim();
  if (!clean || isNaN(Number(clean))) return 0;

  const isNegative = clean.startsWith('-');
  const unsigned = isNegative ? clean.slice(1) : clean;

  const parts = unsigned.split('.');
  const wholePart = parseInt(parts[0] || '0', 10);
  let decPart = parts[1] || '00';

  if (decPart.length === 1) {
    decPart = `${decPart}0`;
  } else if (decPart.length > 2) {
    decPart = decPart.slice(0, 2);
  }

  const fractionPart = parseInt(decPart, 10);
  const totalPaise = wholePart * 100 + fractionPart;

  return isNegative ? -totalPaise : totalPaise;
}

/**
 * Formats integer paise into a standard Indian Rupee string (e.g. 15057 -> "₹150.57").
 */
export function formatPaiseToInr(paise: number): string {
  const isNegative = paise < 0;
  const abs = Math.abs(Math.round(paise));
  const rupees = Math.floor(abs / 100);
  const remainder = abs % 100;
  const remainderStr = remainder < 10 ? `0${remainder}` : remainder.toString();
  return `${isNegative ? '-' : ''}₹${rupees}.${remainderStr}`;
}

/**
 * Calculates delivery fee based on customer distance from restaurant in meters.
 * Rule: Base fee for first 2 km, plus fee per started kilometer thereafter, capped at max fee.
 */
export function calculateDeliveryFee(
  distanceMeters: number,
  rules: PricingRules = DEFAULT_PRICING_RULES
): number {
  if (distanceMeters <= rules.baseDeliveryDistanceMeters) {
    return rules.baseDeliveryFeePaise;
  }

  const excessMeters = distanceMeters - rules.baseDeliveryDistanceMeters;
  const startedKilometers = Math.ceil(excessMeters / 1000);
  const fee = rules.baseDeliveryFeePaise + startedKilometers * rules.distanceFeePerStartedKmPaise;

  return Math.min(fee, rules.maxDeliveryFeePaise);
}

export interface CartItemQuoteInput {
  menuItemId: string;
  name: string;
  pricePaise: number;
  quantity: number;
  isAvailable: boolean;
  selectedModifiers: {
    modifierOptionId: string;
    name: string;
    pricePaise: number;
  }[];
}

export interface QuoteCalculationInput {
  restaurantId: string;
  addressId: string;
  distanceMeters: number;
  items: CartItemQuoteInput[];
  customPackagingPaise?: number;
  discountPaise?: number;
  rules?: PricingRules;
}

export interface CartQuoteItemOutput {
  menuItemId: string;
  name: string;
  unitPricePaise: number;
  quantity: number;
  modifiersTotalPaise: number;
  lineTotalPaise: number;
  isAvailable: boolean;
  selectedModifiers: {
    modifierOptionId: string;
    name: string;
    pricePaise: number;
  }[];
}

export interface CartQuoteResult {
  quoteId: string;
  restaurantId: string;
  addressId: string;
  distanceMeters: number;
  items: CartQuoteItemOutput[];
  subtotalPaise: number;
  foodGstPaise: number;
  deliveryFeePaise: number;
  platformFeePaise: number;
  packagingFeePaise: number;
  discountPaise: number;
  grandTotalPaise: number;
  hasUnavailableItems: boolean;
  expiresAt: string; // ISO 8601 UTC string (15 minutes from calculation)
  pricingVersion: number;
}

/**
 * Computes an immutable, server-side priced quote for a cart with strict integer paise math.
 */
export function calculateCartQuote(
  input: QuoteCalculationInput,
  generateQuoteId: () => string
): CartQuoteResult {
  const rules = input.rules || DEFAULT_PRICING_RULES;
  let subtotalPaise = 0;
  let hasUnavailableItems = false;

  const quoteItems: CartQuoteItemOutput[] = input.items.map((item) => {
    if (!item.isAvailable) {
      hasUnavailableItems = true;
    }

    const modifiersTotalPaise = item.selectedModifiers.reduce(
      (sum, mod) => sum + mod.pricePaise,
      0
    );
    const lineTotalPaise = (item.pricePaise + modifiersTotalPaise) * item.quantity;
    subtotalPaise += lineTotalPaise;

    return {
      menuItemId: item.menuItemId,
      name: item.name,
      unitPricePaise: item.pricePaise,
      quantity: item.quantity,
      modifiersTotalPaise,
      lineTotalPaise,
      isAvailable: item.isAvailable,
      selectedModifiers: item.selectedModifiers,
    };
  });

  // Calculate 5% Food GST on items subtotal (rounded to nearest integer paise)
  const foodGstPaise = Math.round((subtotalPaise * rules.foodGstBps) / 10000);

  // Delivery fee by distance
  const deliveryFeePaise = calculateDeliveryFee(input.distanceMeters, rules);

  // Platform fee
  const platformFeePaise = rules.platformFeePaise;

  // Packaging fee
  const packagingFeePaise = input.customPackagingPaise ?? rules.packagingFeePaise;

  // Discount
  const discountPaise = input.discountPaise || 0;

  // Grand Total Invariant: Subtotal + GST + Delivery + Platform + Packaging - Discount
  const grandTotalPaise = Math.max(
    0,
    subtotalPaise + foodGstPaise + deliveryFeePaise + platformFeePaise + packagingFeePaise - discountPaise
  );

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  return {
    quoteId: generateQuoteId(),
    restaurantId: input.restaurantId,
    addressId: input.addressId,
    distanceMeters: Math.round(input.distanceMeters),
    items: quoteItems,
    subtotalPaise,
    foodGstPaise,
    deliveryFeePaise,
    platformFeePaise,
    packagingFeePaise,
    discountPaise,
    grandTotalPaise,
    hasUnavailableItems,
    expiresAt,
    pricingVersion: rules.version,
  };
}
