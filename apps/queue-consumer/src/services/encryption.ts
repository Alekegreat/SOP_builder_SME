/**
 * Queue consumer's encryption helpers (subset).
 * AES-256-GCM decrypt only.
 */

export async function decrypt(encryptedHex: string, keyHex: string): Promise<string> {
  const data = hexToBytes(encryptedHex);
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);

  const keyBytes = hexToBytes(keyHex);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );

  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext);

  return new TextDecoder().decode(plainBuf);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
