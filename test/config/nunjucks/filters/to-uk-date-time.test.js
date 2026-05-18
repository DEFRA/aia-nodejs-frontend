import { describe, test, expect } from 'vitest'
import { toUkDateTime } from '../../../../src/config/nunjucks/filters/to-uk-date-time.js'

describe('toUkDateTime filter', () => {
  test('should convert ISO UTC string to UK time', () => {
    // 2026-06-15 14:30:00 UTC → BST (+1) = 15:30:00
    const result = toUkDateTime('2026-06-15T14:30:00Z')
    expect(result).toContain('15:30:00')
    expect(result).toContain('15/06/2026')
  })

  test('should convert ISO UTC string in winter to GMT (no offset)', () => {
    // 2026-01-10 09:00:00 UTC → GMT (+0) = 09:00:00
    const result = toUkDateTime('2026-01-10T09:00:00Z')
    expect(result).toContain('09:00:00')
    expect(result).toContain('10/01/2026')
  })

  test('should convert DD/MM/YYYY HH:mm:ss format (treated as UTC)', () => {
    // 15/06/2026 14:30:00 UTC → BST = 15:30:00
    const result = toUkDateTime('15/06/2026 14:30:00')
    expect(result).toContain('15:30:00')
    expect(result).toContain('15/06/2026')
  })

  test('should handle DD/MM/YYYY HH:mm:ss in winter correctly', () => {
    // 10/01/2026 09:00:00 UTC → GMT = 09:00:00
    const result = toUkDateTime('10/01/2026 09:00:00')
    expect(result).toContain('09:00:00')
    expect(result).toContain('10/01/2026')
  })

  test('should return empty string for falsy values', () => {
    expect(toUkDateTime(null)).toBe('')
    expect(toUkDateTime(undefined)).toBe('')
    expect(toUkDateTime('')).toBe('')
  })

  test('should return original value for unparseable strings', () => {
    expect(toUkDateTime('not a date')).toBe('not a date')
  })

  test('should handle ISO string without Z by treating as UTC', () => {
    const result = toUkDateTime('2026-06-15T14:30:00')
    expect(result).toContain('15:30:00')
  })
})
