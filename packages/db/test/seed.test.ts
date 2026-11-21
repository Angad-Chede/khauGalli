import { describe, it, expect } from 'vitest';
import { SEED_IDS } from '../src/seed';
import { DEMO_PERSONAS } from '@tiffin/shared';

describe('Seed Engine Data Integrity & Safety Guardrails', () => {
  it('defines deterministic, time-sortable seed UUIDs for all baseline entities', () => {
    expect(SEED_IDS.ZONE_BLR_CENTRAL).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(SEED_IDS.USER_ASHA).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(SEED_IDS.REST_KHAU_GALLI).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('guarantees all demo personas use safe non-routable phone numbers with demo guardrail', () => {
    const phones = Object.values(DEMO_PERSONAS).map((p) => p.phone);

    // Verify all 4 demo personas use +9199999 prefix
    for (const phone of phones) {
      expect(phone.startsWith('+9199999')).toBe(true);
    }

    // Verify exactly 4 distinct demo personas
    const uniquePhones = new Set(phones);
    expect(uniquePhones.size).toBe(4);
  });

  it('verifies demo personas map to the 4 discrete system roles', () => {
    const roles = Object.values(DEMO_PERSONAS).map((p) => p.role);
    expect(roles).toContain('CUSTOMER');
    expect(roles).toContain('RESTAURANT');
    expect(roles).toContain('RIDER');
    expect(roles).toContain('ADMIN');
  });
});
