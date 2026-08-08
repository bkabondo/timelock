import { describe, it, expect } from 'vitest'
import { readCapsuleFragment } from '@/lib/capsule-fragment'

describe('readCapsuleFragment', () => {
  it('reads token and key from the new link form', () => {
    expect(readCapsuleFragment('#t=abc-123&key=XYZ_789')).toEqual({
      token: 'abc-123',
      key: 'XYZ_789',
    })
  })

  it('reads a key-only fragment, as owner links have always used', () => {
    expect(readCapsuleFragment('#key=XYZ_789')).toEqual({ token: null, key: 'XYZ_789' })
  })

  it('does not care about ordering', () => {
    expect(readCapsuleFragment('#key=XYZ_789&t=abc-123')).toEqual({
      token: 'abc-123',
      key: 'XYZ_789',
    })
  })

  it('returns nulls for an empty or absent fragment', () => {
    expect(readCapsuleFragment('')).toEqual({ token: null, key: null })
    expect(readCapsuleFragment('#')).toEqual({ token: null, key: null })
  })

  it('ignores values outside the base64url alphabet rather than passing them on', () => {
    // Keeps a crafted fragment from reaching the header or the key importer.
    expect(readCapsuleFragment('#t=abc def&key=<script>')).toEqual({ token: null, key: null })
  })

  it('does not mistake a key embedded in the token for the key', () => {
    // A regex for /key=(...)/ over the raw hash would match inside the token.
    expect(readCapsuleFragment('#t=notakey&key=realkey')).toEqual({
      token: 'notakey',
      key: 'realkey',
    })
  })
})
