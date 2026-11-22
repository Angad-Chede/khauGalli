import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  verifyRazorpayWebhookSignature,
  computeRazorpayWebhookSignature,
} from '../src/lib/razorpay';

describe('Razorpay Raw Body Webhook HMAC Verifier', () => {
  const secret = 'webhook_secret_key_super_safe_12345';

  it('successfully verifies a valid HMAC-SHA256 signature against unaltered raw body', () => {
    const rawBody = JSON.stringify({
      entity: 'event',
      account_id: 'acc_test_123',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_1234567890',
            amount: 54900,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    });

    const signature = computeRazorpayWebhookSignature(rawBody, secret);
    const isValid = verifyRazorpayWebhookSignature(rawBody, signature, secret);

    expect(isValid).toBe(true);
  });

  it('rejects verification if even a single byte in the raw body is tampered with', () => {
    const originalBody = JSON.stringify({
      entity: 'event',
      event: 'payment.captured',
      payload: { payment: { entity: { amount: 50000 } } },
    });

    const signature = computeRazorpayWebhookSignature(originalBody, secret);

    // Tampered body (amount changed from 50000 to 50001)
    const tamperedBody = JSON.stringify({
      entity: 'event',
      event: 'payment.captured',
      payload: { payment: { entity: { amount: 50001 } } },
    });

    const isValid = verifyRazorpayWebhookSignature(tamperedBody, signature, secret);
    expect(isValid).toBe(false);
  });

  it('rejects verification if an incorrect secret is used', () => {
    const rawBody = '{"event":"payment.captured"}';
    const signature = computeRazorpayWebhookSignature(rawBody, 'wrong_secret');

    const isValid = verifyRazorpayWebhookSignature(rawBody, signature, secret);
    expect(isValid).toBe(false);
  });

  it('gracefully handles empty strings and nulls without throwing', () => {
    expect(verifyRazorpayWebhookSignature('', 'sig', secret)).toBe(false);
    expect(verifyRazorpayWebhookSignature('body', '', secret)).toBe(false);
    expect(verifyRazorpayWebhookSignature('body', 'sig', '')).toBe(false);
  });
});
