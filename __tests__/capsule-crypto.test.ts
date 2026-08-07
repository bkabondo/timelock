import { describe, it, expect, beforeAll } from 'vitest'
import { generateCapsuleKey, encryptLetter, decryptLetter } from '@/lib/capsule-crypto'

beforeAll(async () => {
  // jsdom does not implement Web Crypto; use Node's, which is spec-compliant.
  if (!globalThis.crypto?.subtle) {
    const { webcrypto } = await import('node:crypto')
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
  }
})

describe('capsule crypto', () => {
  it('round-trips a letter through encrypt → decrypt', async () => {
    const key = await generateCapsuleKey()
    const letter = 'Dear future me,\n\nRemember the courage it took to seal this. 🎂✨'
    const { ciphertext, iv } = await encryptLetter(key, letter)
    expect(ciphertext).not.toContain('Dear future me')
    await expect(decryptLetter(key, ciphertext, iv)).resolves.toBe(letter)
  })

  it('rejects the wrong key — GCM authenticates, not just scrambles', async () => {
    const rightKey = await generateCapsuleKey()
    const wrongKey = await generateCapsuleKey()
    const { ciphertext, iv } = await encryptLetter(rightKey, 'sealed secret')
    await expect(decryptLetter(wrongKey, ciphertext, iv)).rejects.toThrow()
  })

  it('rejects tampered ciphertext', async () => {
    const key = await generateCapsuleKey()
    const { ciphertext, iv } = await encryptLetter(key, 'sealed secret')
    const tampered = ciphertext.slice(0, -2) + (ciphertext.endsWith('AA') ? 'BB' : 'AA')
    await expect(decryptLetter(key, tampered, iv)).rejects.toThrow()
  })

  it('never reuses an IV and never emits identical ciphertext', async () => {
    const key = await generateCapsuleKey()
    const a = await encryptLetter(key, 'same letter')
    const b = await encryptLetter(key, 'same letter')
    expect(a.iv).not.toBe(b.iv)
    expect(a.ciphertext).not.toBe(b.ciphertext)
  })

  it('produces URL-fragment-safe keys (no +, /, =, #)', async () => {
    for (let i = 0; i < 5; i++) {
      const key = await generateCapsuleKey()
      expect(key).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(key.length).toBe(43) // 32 bytes, base64url, unpadded
    }
  })
})
