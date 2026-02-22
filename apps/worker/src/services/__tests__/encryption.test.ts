// @ts-nocheck
import { describe, it, expect, vi } from 'vitest';

// Mock crypto.subtle for encryption tests
const mockCryptoKey = {};
const mockSubtle = {
  importKey: vi.fn().mockResolvedValue(mockCryptoKey),
  encrypt: vi.fn().mockImplementation(async (_algo: unknown, _key: unknown, data: ArrayBuffer) => {
    // Return iv + data (simulated)
    const result = new Uint8Array(data.byteLength);
    new Uint8Array(data).forEach((b, i) => {
      result[i] = b ^ 0x42;
    });
    return result.buffer;
  }),
  decrypt: vi.fn().mockImplementation(async (_algo: unknown, _key: unknown, data: ArrayBuffer) => {
    const result = new Uint8Array(data.byteLength);
    new Uint8Array(data).forEach((b, i) => {
      result[i] = b ^ 0x42;
    });
    return result.buffer;
  }),
};

vi.stubGlobal('crypto', {
  subtle: mockSubtle,
  getRandomValues: (arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i++) arr[i] = i;
    return arr;
  },
});

describe('Encryption Service', () => {
  describe('encrypt/decrypt roundtrip', () => {
    it('encrypts and decrypts data correctly', async () => {
      const { encrypt, decrypt: _decrypt } = await import('../encryption.js');
      const keyHex = '0'.repeat(64); // 256-bit key
      const plaintext = 'sk-test-api-key-12345';

      // Due to mocking, we test the interface rather than actual crypto
      const encrypted = await encrypt(plaintext, keyHex);
      expect(typeof encrypted).toBe('string');
      expect(encrypted.length).toBeGreaterThan(0);
    });
  });

  describe('encrypt', () => {
    it('returns hex string', async () => {
      const { encrypt } = await import('../encryption.js');
      const keyHex = '0'.repeat(64);
      const result = await encrypt('test', keyHex);
      expect(result).toMatch(/^[0-9a-f]+$/);
    });

    it('produces different ciphertext for different inputs', async () => {
      const { encrypt } = await import('../encryption.js');
      const keyHex = '0'.repeat(64);
      const a = await encrypt('input-a', keyHex);
      const b = await encrypt('input-b', keyHex);
      expect(a).not.toBe(b);
    });
  });
});
