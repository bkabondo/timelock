import { describe, it, expect } from 'vitest'
import { humanizeDbError } from '@/lib/db-errors'

describe('humanizeDbError', () => {
  it('explains the foreign key violation that reached a real user', () => {
    const msg = humanizeDbError({
      code: '23503',
      message:
        'insert or update on table "timelock_capsules" violates foreign key constraint "timelock_capsules_user_id_fkey"',
    })
    expect(msg).toMatch(/TimeLock account/i)
    expect(msg).not.toMatch(/constraint|timelock_capsules|fkey/i)
  })

  it('never passes the driver text through for unknown codes', () => {
    const msg = humanizeDbError({ code: '99999', message: 'relation "secret_table" does not exist' })
    expect(msg).not.toMatch(/secret_table|relation/i)
    expect(msg).toBe('Something went wrong. Please try again.')
  })

  it('uses the caller fallback when one is given', () => {
    expect(humanizeDbError({ code: 'nope' }, 'Could not seal your capsule.')).toBe(
      'Could not seal your capsule.'
    )
  })

  it('handles null and undefined without throwing', () => {
    expect(humanizeDbError(null)).toBe('Something went wrong. Please try again.')
    expect(humanizeDbError(undefined)).toBe('Something went wrong. Please try again.')
  })

  it('passes through our own trigger messages, which are already plain', () => {
    // The unlock_date trigger raises this; the author should see it verbatim.
    expect(
      humanizeDbError({
        code: 'P0001',
        message: 'unlock_date is immutable: capsules cannot be resealed or unsealed early',
      })
    ).toBe('capsules cannot be resealed or unsealed early')
  })

  it('maps permission failures without hinting at the policy', () => {
    expect(humanizeDbError({ code: '42501' })).toMatch(/permission/i)
  })
})
