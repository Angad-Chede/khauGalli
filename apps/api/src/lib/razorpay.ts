import crypto from 'node:crypto';
import { generateUUIDv7 } from '@tiffin/shared';

export interface CreateRazorpayOrderInput {
  orderId: string;
  amountPaise: number;
  currency?: string;
  receipt?: string;
  notes?: Record<string, string>;
}

export interface RazorpayOrderResult {
  id: string;
  entity: 'order';
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: 'created' | 'attempted' | 'paid';
  attempts: number;
  created_at: number;
}

export interface IssueRefundInput {
  paymentId: string;
  amountPaise: number;
  notes?: Record<string, string>;
}

export interface RefundResult {
  id: string;
  entity: 'refund';
  amount: number;
  currency: string;
  payment_id: string;
  status: 'processed' | 'pending' | 'failed';
  created_at: number;
}

/**
 * Verify Razorpay Webhook HMAC-SHA256 signature using constant-time comparison
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string | Buffer,
  signature: string,
  secret: string
): boolean {
  if (!rawBody || !signature || !secret) {
    return false;
  }

  try {
    const rawString = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawString)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf-8');
    const signatureBuffer = Buffer.from(signature, 'utf-8');

    if (expectedBuffer.length !== signatureBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
  } catch {
    return false;
  }
}

/**
 * Compute valid signature for testing / webhook generation
 */
export function computeRazorpayWebhookSignature(rawBody: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

/**
 * Razorpay Gateway Adapter with Mock/Test and Live Support
 */
export class RazorpayAdapter {
  private keyId: string;
  private keySecret: string;
  private isMock: boolean;

  constructor(
    keyId: string = process.env.RAZORPAY_KEY_ID || 'rzp_test_mock_key',
    keySecret: string = process.env.RAZORPAY_KEY_SECRET || 'rzp_test_mock_secret'
  ) {
    this.keyId = keyId;
    this.keySecret = keySecret;
    this.isMock =
      this.keyId.startsWith('rzp_test_mock') ||
      process.env.NODE_ENV === 'test' ||
      !process.env.RAZORPAY_KEY_ID;
  }

  async createOrder(input: CreateRazorpayOrderInput): Promise<RazorpayOrderResult> {
    if (this.isMock) {
      const mockOrderId = `order_${generateUUIDv7().replace(/-/g, '').slice(0, 14)}`;
      return {
        id: mockOrderId,
        entity: 'order',
        amount: input.amountPaise,
        amount_paid: 0,
        amount_due: input.amountPaise,
        currency: input.currency || 'INR',
        receipt: input.receipt || input.orderId,
        status: 'created',
        attempts: 0,
        created_at: Math.floor(Date.now() / 1000),
      };
    }

    // Live Razorpay API call
    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: input.currency || 'INR',
        receipt: input.receipt || input.orderId,
        notes: input.notes,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Razorpay order creation failed: ${err}`);
    }

    return (await response.json()) as RazorpayOrderResult;
  }

  async issueRefund(input: IssueRefundInput): Promise<RefundResult> {
    if (this.isMock) {
      const mockRefundId = `rfnd_${generateUUIDv7().replace(/-/g, '').slice(0, 14)}`;
      return {
        id: mockRefundId,
        entity: 'refund',
        amount: input.amountPaise,
        currency: 'INR',
        payment_id: input.paymentId,
        status: 'processed',
        created_at: Math.floor(Date.now() / 1000),
      };
    }

    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    const response = await fetch(
      `https://api.razorpay.com/v1/payments/${input.paymentId}/refund`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify({
          amount: input.amountPaise,
          notes: input.notes,
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Razorpay refund failed: ${err}`);
    }

    return (await response.json()) as RefundResult;
  }
}

export const razorpayClient = new RazorpayAdapter();
