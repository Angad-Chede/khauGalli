import { randomBytes } from 'crypto';

/**
 * Generate a cryptographically secure, time-sortable UUIDv7 (RFC 9562).
 * Format: 8-4-4-4-12 hex characters with timestamp in high 48 bits, version 7, variant 1.
 */
export function generateUuidV7(): string {
  const bytes = randomBytes(16);
  const now = Date.now();

  // 48-bit timestamp
  bytes[0] = (now / 0x10000000000) & 0xff;
  bytes[1] = (now / 0x100000000) & 0xff;
  bytes[2] = (now / 0x1000000) & 0xff;
  bytes[3] = (now / 0x10000) & 0xff;
  bytes[4] = (now / 0x100) & 0xff;
  bytes[5] = now & 0xff;

  // Version 7: 0111 in bits 4-7 of byte 6
  bytes[6] = (bytes[6] & 0x0f) | 0x70;

  // Variant 1: 10 in bits 6-7 of byte 8
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
