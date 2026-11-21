import { describe, it, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { buildServer } from '../src/server';
import { FastifyInstance } from 'fastify';

describe('Staff Scoping & IDOR Security Tests', () => {
  let app: FastifyInstance;
  const jwtSecret = 'test_secret_must_be_32_characters_long_min_1234';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = jwtSecret;
    app = await buildServer();
    await app.ready();
  });

  it('rejects customer token on /r/* with HTTP 403 Forbidden', async () => {
    // Generate valid JWT for Asha (Customer, not staff)
    const customerToken = jwt.sign(
      {
        sub: '018f0000-0000-7000-8000-000000000011', // Asha
        phone: '+919999900001',
        roles: ['CUSTOMER'],
        activeRole: 'CUSTOMER',
        isDemo: true,
      },
      jwtSecret
    );

    const res = await app.inject({
      method: 'GET',
      url: '/r/profile',
      headers: {
        authorization: `Bearer ${customerToken}`,
      },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.code).toBe('NOT_STAFF_MEMBER');
  });

  it('rejects unauthenticated requests on /r/* with HTTP 401 Unauthorized', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/r/profile',
    });

    expect(res.statusCode).toBe(401);
  });
});
