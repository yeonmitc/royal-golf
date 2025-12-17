// src/utils/crypto.js
export async function sha256Hex(input) {
  const enc = new TextEncoder();
  const data = enc.encode(String(input ?? ''));
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map((b) => b.toString(16).padStart(2, '0')).join('');
}
