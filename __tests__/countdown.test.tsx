import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { Countdown } from '@/components/Countdown'

describe('Countdown Component', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders time units correctly for future date', () => {
    const futureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString() // 2 days from now
    render(<Countdown unlockDate={futureDate} />)

    expect(screen.getByText('Days')).toBeInTheDocument()
    expect(screen.getByText('Hours')).toBeInTheDocument()
    expect(screen.getByText('Mins')).toBeInTheDocument()
    expect(screen.getByText('Secs')).toBeInTheDocument()
  })

  it('shows unlocking message for past date', () => {
    const pastDate = new Date(Date.now() - 1000).toISOString()
    render(<Countdown unlockDate={pastDate} />)
    expect(screen.getByText(/unlocking now/i)).toBeInTheDocument()
  })

  it('updates every second', () => {
    const futureDate = new Date(Date.now() + 10 * 1000).toISOString() // 10 seconds from now
    render(<Countdown unlockDate={futureDate} />)

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // Should still show countdown units
    expect(screen.getByText('Secs')).toBeInTheDocument()
  })

  it('calls onUnlocked when timer reaches zero', () => {
    const onUnlocked = vi.fn()
    const nearFutureDate = new Date(Date.now() + 500).toISOString()
    render(<Countdown unlockDate={nearFutureDate} onUnlocked={onUnlocked} />)

    act(() => {
      vi.advanceTimersByTime(1500)
    })

    expect(onUnlocked).toHaveBeenCalled()
  })

  it('pads single digit numbers with zero', () => {
    // Create a date that's exactly 1 day, 1 hour, 1 min, 1 sec away
    const specificDate = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000 + 1 * 60 * 60 * 1000 + 1 * 60 * 1000 + 1000).toISOString()
    render(<Countdown unlockDate={specificDate} />)

    // Numbers should be padded - find elements with 2 digit formatting
    const dayEl = screen.getByText('Days').previousElementSibling
    expect(dayEl?.textContent).toMatch(/^\d{2}$/)
  })
})
