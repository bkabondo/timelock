'use client'

import { useState, useEffect } from 'react'

interface CountdownProps {
  unlockDate: string
  onUnlocked?: () => void
}

interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
}

function calculateTimeLeft(unlockDate: string): TimeLeft | null {
  const diff = new Date(unlockDate).getTime() - Date.now()
  if (diff <= 0) return null

  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((diff % (1000 * 60)) / 1000),
  }
}

export function Countdown({ unlockDate, onUnlocked }: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(() => calculateTimeLeft(unlockDate))

  useEffect(() => {
    const timer = setInterval(() => {
      const left = calculateTimeLeft(unlockDate)
      setTimeLeft(left)
      if (!left && onUnlocked) {
        onUnlocked()
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [unlockDate, onUnlocked])

  if (!timeLeft) {
    return (
      <div className="text-center py-4">
        <p className="text-primary font-semibold text-lg animate-pulse">Unlocking now...</p>
      </div>
    )
  }

  const units = [
    { label: 'Days', value: timeLeft.days },
    { label: 'Hours', value: timeLeft.hours },
    { label: 'Mins', value: timeLeft.minutes },
    { label: 'Secs', value: timeLeft.seconds },
  ]

  return (
    <div className="flex items-center justify-center gap-3 py-2">
      {units.map(({ label, value }) => (
        <div
          key={label}
          className="flex flex-col items-center bg-secondary/50 rounded-lg px-3 py-2 min-w-[60px] border border-border"
        >
          <span className="text-2xl font-mono font-bold text-primary leading-none">
            {String(value).padStart(2, '0')}
          </span>
          <span className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}
