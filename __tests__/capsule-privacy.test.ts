import { describe, it, expect } from 'vitest'
import { canViewCapsuleContents } from '@/lib/capsule-privacy'

describe('canViewCapsuleContents', () => {
  it('lets the author read their own capsule', () => {
    expect(canViewCapsuleContents({ isOwner: true, isPublic: false })).toBe(true)
  })

  it('lets anyone read a capsule the author published', () => {
    expect(canViewCapsuleContents({ isOwner: false, isPublic: true })).toBe(true)
  })

  it('hides a private capsule from everyone but its author', () => {
    expect(canViewCapsuleContents({ isOwner: false, isPublic: false })).toBe(false)
  })

  it('gives an admin no way in — role is not part of the rule', () => {
    // The only inputs are ownership, publication and the guest token. There is
    // deliberately no isAdmin escape hatch, so no combination reveals a
    // private capsule to an operator.
    expect(canViewCapsuleContents({ isOwner: false, isPublic: false })).toBe(false)
    expect(canViewCapsuleContents({ isOwner: false, isPublic: null })).toBe(false)
    expect(canViewCapsuleContents({ isOwner: false, isPublic: undefined })).toBe(false)
  })

  it('opens a guest capsule for a caller holding its secret link', () => {
    expect(
      canViewCapsuleContents({ isOwner: false, isPublic: false, hasValidGuestToken: true })
    ).toBe(true)
  })

  it('keeps a guest capsule shut without the token', () => {
    // The old rule treated every logged-out visitor as the owner of every
    // ownerless capsule, which made guest capsules world-readable.
    expect(
      canViewCapsuleContents({ isOwner: false, isPublic: false, hasValidGuestToken: false })
    ).toBe(false)
    expect(canViewCapsuleContents({ isOwner: false, isPublic: false })).toBe(false)
  })
})
