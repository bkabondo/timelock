import { describe, it, expect } from 'vitest'

// Utility functions for capsule logic
function isCapsuleUnlocked(unlockDate: string): boolean {
  return new Date(unlockDate) <= new Date()
}

function getTimeLeft(unlockDate: string): { days: number; hours: number; minutes: number; seconds: number } | null {
  const diff = new Date(unlockDate).getTime() - Date.now()
  if (diff <= 0) return null

  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((diff % (1000 * 60)) / 1000),
  }
}

function validateCapsuleTitle(title: string): { valid: boolean; error?: string } {
  if (!title.trim()) return { valid: false, error: 'Title is required' }
  if (title.length > 100) return { valid: false, error: 'Title must be 100 characters or less' }
  return { valid: true }
}

function validateUnlockDate(date: string): { valid: boolean; error?: string } {
  const unlockDate = new Date(date)
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)

  if (isNaN(unlockDate.getTime())) return { valid: false, error: 'Invalid date' }
  if (unlockDate < tomorrow) return { valid: false, error: 'Unlock date must be at least tomorrow' }
  return { valid: true }
}

describe('Capsule Utilities', () => {
  describe('isCapsuleUnlocked', () => {
    it('returns true for past dates', () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString()
      expect(isCapsuleUnlocked(pastDate)).toBe(true)
    })

    it('returns false for future dates', () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString()
      expect(isCapsuleUnlocked(futureDate)).toBe(false)
    })
  })

  describe('getTimeLeft', () => {
    it('returns null for past date', () => {
      const pastDate = new Date(Date.now() - 1000).toISOString()
      expect(getTimeLeft(pastDate)).toBeNull()
    })

    it('returns time object for future date', () => {
      // Deliberately not a whole number of days. `days` floors, so an exact
      // 2-day offset lands on the boundary and yields 2 or 1 depending on
      // whether a millisecond elapses between building the date and reading
      // the clock inside getTimeLeft. The extra hour keeps it off the edge.
      const futureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString()
      const result = getTimeLeft(futureDate)
      expect(result).not.toBeNull()
      expect(result?.days).toBe(2)
      expect(result?.hours).toBeGreaterThanOrEqual(0)
      expect(result?.minutes).toBeGreaterThanOrEqual(0)
      expect(result?.seconds).toBeGreaterThanOrEqual(0)
    })

    it('returns all units as non-negative numbers', () => {
      const futureDate = new Date(Date.now() + 3661000).toISOString() // 1hr 1min 1sec
      const result = getTimeLeft(futureDate)
      expect(result?.days).toBeGreaterThanOrEqual(0)
      expect(result?.hours).toBeGreaterThanOrEqual(0)
      expect(result?.minutes).toBeGreaterThanOrEqual(0)
      expect(result?.seconds).toBeGreaterThanOrEqual(0)
    })
  })

  describe('validateCapsuleTitle', () => {
    it('validates empty title', () => {
      expect(validateCapsuleTitle('')).toMatchObject({ valid: false })
      expect(validateCapsuleTitle('   ')).toMatchObject({ valid: false })
    })

    it('validates title too long', () => {
      const longTitle = 'a'.repeat(101)
      expect(validateCapsuleTitle(longTitle)).toMatchObject({ valid: false })
    })

    it('validates valid title', () => {
      expect(validateCapsuleTitle('My Time Capsule')).toMatchObject({ valid: true })
    })

    it('validates title at max length', () => {
      const maxTitle = 'a'.repeat(100)
      expect(validateCapsuleTitle(maxTitle)).toMatchObject({ valid: true })
    })
  })

  describe('validateUnlockDate', () => {
    it('rejects past dates', () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
      expect(validateUnlockDate(yesterday)).toMatchObject({ valid: false })
    })

    it('rejects invalid date strings', () => {
      expect(validateUnlockDate('not-a-date')).toMatchObject({ valid: false })
    })

    it('accepts future dates', () => {
      const nextYear = new Date()
      nextYear.setFullYear(nextYear.getFullYear() + 1)
      const futureDate = nextYear.toISOString().split('T')[0]
      expect(validateUnlockDate(futureDate)).toMatchObject({ valid: true })
    })
  })
})
