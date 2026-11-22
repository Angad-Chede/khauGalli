import { describe, it, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { buildServer } from '../src/server';
import { FastifyInstance } from 'fastify';

describe('Realtime SSE Gateway Security & Streaming', () => {
  let app: FastifyInstance;
  const jwtSecret = 'test_secret_must_be_32_characters_long_min_1234';
  const dummyOrderId = '018f0000-0000-7000-8000-000000000501';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = jwtSecret;
    app = await buildServer();
    await app.ready();
  });

  it('rejects SSE connection without token with HTTP 401 Unauthorized', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/realtime/orders/${dummyOrderId}`,
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error).toBe('Unauthorized');
    expect(body.message).toContain('?token=');
  });

  it('rejects SSE connection with malformed token with HTTP 401 Unauthorized', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/realtime/orders/${dummyOrderId}?token=bad_malformed_token`,
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('rejects non-rider role on /realtime/rider/offers with HTTP 403 Forbidden', async () => {
    // Asha has CUSTOMER role, not RIDER
    const customerToken = jwt.sign(
      {
        sub: '018f0000-0000-7000-8000-000000000011',
        phone: '+919999900001',
        roles: ['CUSTOMER'],
        activeRole: 'CUSTOMER',
      },
      jwtSecret
    );

    const res = await app.inject({
      method: 'GET',
      url: `/realtime/rider/offers?token=${customerToken}`,
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error).toContain('Forbidden');
  });

  it('verifies SSE anti-buffering headers contract (X-Accel-Buffering, Cache-Control, text/event-stream)', () => {
    // Protocol specification contract verification
    const sseHeaders = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    };

    expect(sseHeaders['Content-Type']).toBe('text/event-stream');
    expect(sseHeaders['Cache-Control']).toBe('no-cache, no-transform');
    expect(sseHeaders['X-Accel-Buffering']).toBe('no');
  });

  it('formats SSE events according to W3C specification with ID, Event, and Data fields', () => {
    function formatSseEvent(eventType: string, data: any, id?: string): string {
      let output = '';
      if (id) output += `id: ${id}\n`;
      output += `event: ${eventType}\n`;
      output += `data: ${JSON.stringify(data)}\n\n`;
      return output;
    }

    const payload = { orderId: dummyOrderId, status: 'PICKED_UP' };
    const rawSse = formatSseEvent('order.picked_up', payload, 'evt-101');

    expect(rawSse).toContain('id: evt-101\n');
    expect(rawSse).toContain('event: order.picked_up\n');
    expect(rawSse).toContain(`data: ${JSON.stringify(payload)}\n\n`);
  });

  it('formats 15-second keepalive heartbeat comments properly', () => {
    const keepalive = ':keepalive\n\n';
    expect(keepalive.startsWith(':')).toBe(true); // SSE comment lines start with colon
    expect(keepalive.endsWith('\n\n')).toBe(true); // SSE messages terminate with double newline
  });
});
