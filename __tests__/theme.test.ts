import { describe, it, expect } from 'vitest'

const THEMES = ['birthday', 'letter', 'goals', 'memory', 'other'] as const
type Theme = typeof THEMES[number]

const THEME_EMOJIS: Record<Theme | 'default', string> = {
  birthday: '🎂',
  letter: '✉️',
  goals: '🎯',
  memory: '💭',
  other: '📦',
  default: '⏳',
}

function getThemeEmoji(theme: string): string {
  return THEME_EMOJIS[theme as Theme] ?? THEME_EMOJIS.default
}

function isValidTheme(theme: string): theme is Theme {
  return (THEMES as readonly string[]).includes(theme)
}

describe('Theme Utilities', () => {
  it('returns correct emoji for each theme', () => {
    expect(getThemeEmoji('birthday')).toBe('🎂')
    expect(getThemeEmoji('letter')).toBe('✉️')
    expect(getThemeEmoji('goals')).toBe('🎯')
    expect(getThemeEmoji('memory')).toBe('💭')
    expect(getThemeEmoji('other')).toBe('📦')
  })

  it('returns default emoji for unknown theme', () => {
    expect(getThemeEmoji('unknown')).toBe('⏳')
    expect(getThemeEmoji('')).toBe('⏳')
  })

  it('validates known themes', () => {
    THEMES.forEach(theme => {
      expect(isValidTheme(theme)).toBe(true)
    })
  })

  it('rejects invalid themes', () => {
    expect(isValidTheme('invalid')).toBe(false)
    expect(isValidTheme('')).toBe(false)
    expect(isValidTheme('BIRTHDAY')).toBe(false)
  })

  it('has exactly 5 valid themes', () => {
    expect(THEMES.length).toBe(5)
  })
})
