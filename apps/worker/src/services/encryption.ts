/**
 * AES-256-GCM encryption for BYO API keys at rest.
 * Uses the Web Crypto API available in Cloudflare Workers.
 */

/**
 * Encrypt a string using AES-256-GCM
 */
export async function encrypt(plaintext: string, keyHex: string): Promise<string> {
  const key = await importKey(keyHex);
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext),
  );

  // Combine IV + ciphertext and encode as hex
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return arrayToHex(combined);
}

/**
 * Decrypt a string using AES-256-GCM
 */
export async function decrypt(encryptedHex: string, keyHex: string): Promise<string> {
  const key = await importKey(keyHex);
  const combined = hexToArray(encryptedHex);

  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(plaintext);
}

/**
 * Import encryption key from hex string
 */
async function importKey(keyHex: string): Promise<CryptoKey> {
  const keyData = hexToArray(keyHex);
  if (keyData.length !== 32) {
    throw new Error('Encryption key must be 32 bytes (256 bits) in hex format');
  }
    return crypto.subtle.importKey('raw', keyData.buffer as ArrayBuffer, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

function arrayToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToArray(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
