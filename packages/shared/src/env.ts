import { z } from 'zod';

const DEFAULT_DEV_JWT_SECRET = 'dev_jwt_secret_change_in_production_super_safe_key_123456';

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),

  // Database URLs
  DATABASE_URL: z.string().url(),
  DIRECT_DATABASE_URL: z.string().url().optional(),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Auth
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long for security'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_DAYS: z.coerce.number().default(30),

  // Demo & Dev Guardrails
  ALLOW_DEMO_BYPASS_OTP: z.enum(['true', 'false']).default('false'),
  SHOW_DEMO_PERSONA_BAR: z.enum(['true', 'false']).default('true'),

  // Payment & External
  RAZORPAY_KEY_ID: z.string().optional().default('rzp_test_mock'),
  RAZORPAY_KEY_SECRET: z.string().optional().default('mock_secret'),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default('mock_webhook_secret'),
  NOTIFICATION_MODE: z.enum(['mock', 'live']).default('mock'),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

/**
 * Validates environment variables with strict production security guardrails.
 */
export function validateEnv(rawEnv: Record<string, string | undefined>): EnvConfig {
  const result = EnvSchema.safeParse(rawEnv);

  if (!result.success) {
    const errorDetails = result.error.format();
    throw new Error(
      `Invalid environment configuration: ${JSON.stringify(errorDetails, null, 2)}`
    );
  }

  const env = result.data;

  // HARD PRODUCTION BOOT GATES
  if (env.NODE_ENV === 'production') {
    // 1. Refuse boot if demo OTP bypass is enabled
    if (env.ALLOW_DEMO_BYPASS_OTP === 'true') {
      throw new Error(
        'FATAL SECURITY VIOLATION: ALLOW_DEMO_BYPASS_OTP cannot be "true" when NODE_ENV is "production". Server boot aborted.'
      );
    }

    // 2. Refuse boot if default development JWT_SECRET is used
    if (env.JWT_SECRET === DEFAULT_DEV_JWT_SECRET || env.JWT_SECRET.toLowerCase().includes('change_in_production')) {
      throw new Error(
        'FATAL SECURITY VIOLATION: Default development JWT_SECRET cannot be used in production. Provide a secure random secret.'
      );
    }

    // 3. Refuse boot if mock Razorpay keys are used
    if (!env.RAZORPAY_KEY_ID || env.RAZORPAY_KEY_ID.startsWith('rzp_test_mock') || env.RAZORPAY_KEY_SECRET === 'mock_secret') {
      throw new Error(
        'FATAL SECURITY VIOLATION: Mock Razorpay credentials cannot be used in production. Real production API credentials required.'
      );
    }
  }

  return env;
}
