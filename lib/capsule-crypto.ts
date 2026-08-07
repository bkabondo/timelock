/**
 * Client-side end-to-end encryption for capsule letters (AES-256-GCM via the
 * Web Crypto API).
 *
 * The key is generated in the browser at sealing time and NEVER sent to the
 * server: it travels only in the reveal link's URL fragment (#key=...), which
 * browsers do not include in requests. The database stores ciphertext + IV,
 * so neither other users, nor devtools network inspection, nor the platform
 * operator with the service-role key can read a letter — and if the key is
 * lost, the letter is unrecoverable by anyone, including us.
 */

function toB64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64Url(text: string): Uint8Array<ArrayBuffer> {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** Generates a fresh AES-256 key, returned in URL-fragment-safe base64url. */
export async function generateCapsuleKey(): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt'])
  const raw = await crypto.subtle.exportKey('raw', key)
  return toB64Url(new Uint8Array(raw))
}

export async function encryptLetter(
  keyB64: string,
  plaintext: string
): Promise<{ ciphertext: string; iv: string }> {
  const key = await crypto.subtle.importKey('raw', fromB64Url(keyB64), 'AES-GCM', false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext))
  return { ciphertext: toB64Url(new Uint8Array(ct)), iv: toB64Url(iv) }
}

/** Throws on a wrong key or tampered ciphertext (GCM authenticates). */
export async function decryptLetter(keyB64: string, ciphertext: string, iv: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', fromB64Url(keyB64), 'AES-GCM', false, ['decrypt'])
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64Url(iv) }, key, fromB64Url(ciphertext))
  return new TextDecoder().decode(pt)
}
