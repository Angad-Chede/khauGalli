import { describe, it, expect } from 'vitest';
import { validateEnv } from '../src/env';

describe('Production Boot Guardrails (Extended)', () => {
  const validBaseProdEnv = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://postgres:prod_pass@neon.tech/tiffin_prod',
    REDIS_URL: 'rediss://default:prod_pass@upstash.io:6379',
    JWT_SECRET: 'production_super_strong_random_secret_at_least_32_chars_long',
    ALLOW_DEMO_BYPASS_OTP: 'false',
    SHOW_DEMO_PERSONA_BAR: 'false',
    RAZORPAY_KEY_ID: 'rzp_live_real_gateway_key_123',
    RAZORPAY_KEY_SECRET: 'real_production_secret_456',
    RAZORPAY_WEBHOOK_SECRET: 'real_webhook_secret_789',
    NOTIFICATION_MODE: 'live',
  };

  it('permits boot in production when all credentials and security flags are valid', () => {
    const config = validateEnv(validBaseProdEnv);
    expect(config.NODE_ENV).toBe('production');
  });

  it('refuses to boot in production if demo OTP bypass is enabled', () => {
    expect(() =>
      validateEnv({
        ...validBaseProdEnv,
        ALLOW_DEMO_BYPASS_OTP: 'true',
      })
    ).toThrow(/ALLOW_DEMO_BYPASS_OTP cannot be "true" when NODE_ENV is "production"/);
  });

  it('refuses to boot in production if default development JWT_SECRET is used', () => {
    expect(() =>
      validateEnv({
        ...validBaseProdEnv,
        JWT_SECRET: 'dev_jwt_secret_change_in_production_super_safe_key_123456',
      })
    ).toThrow(/Default development JWT_SECRET cannot be used in production/);
  });

  it('refuses to boot in production if mock Razorpay credentials are used', () => {
    expect(() =>
      validateEnv({
        ...validBaseProdEnv,
        RAZORPAY_KEY_ID: 'rzp_test_mock_key_id',
      })
    ).toThrow(/Mock Razorpay credentials cannot be used in production/);
  });
});
