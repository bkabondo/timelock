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
    // The only inputs are ownership and publication. There is deliberately no
    // isAdmin escape hatch, so no combination of flags reveals a private capsule.
    expect(canViewCapsuleContents({ isOwner: false, isPublic: false })).toBe(false)
    expect(canViewCapsuleContents({ isOwner: false, isPublic: null })).toBe(false)
    expect(canViewCapsuleContents({ isOwner: false, isPublic: undefined })).toBe(false)
  })
})
