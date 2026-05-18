import { formatNumber } from '../../../../src/config/nunjucks/filters/format-number.js'

describe('#formatNumber', () => {
  test('Should format whole numbers with thousands separators', () => {
    expect(formatNumber(1234567)).toBe('1,234,567')
  })

  test('Should format four-digit numbers', () => {
    expect(formatNumber(1000)).toBe('1,000')
  })

  test('Should return zero as string', () => {
    expect(formatNumber(0)).toBe('0')
  })

  test('Should format decimal numbers', () => {
    expect(formatNumber(1234.56)).toBe('1,234.56')
  })

  test('Should format string numeric values', () => {
    expect(formatNumber('900200')).toBe('900,200')
  })

  test('Should return empty string for null', () => {
    expect(formatNumber(null)).toBe('')
  })

  test('Should return empty string for undefined', () => {
    expect(formatNumber(undefined)).toBe('')
  })

  test('Should return empty string for empty string', () => {
    expect(formatNumber('')).toBe('')
  })

  test('Should return original value for non-numeric strings', () => {
    expect(formatNumber('abc')).toBe('abc')
  })

  test('Should format negative numbers', () => {
    expect(formatNumber(-1234)).toBe('-1,234')
  })

  test('Should format numbers under 1000 without separators', () => {
    expect(formatNumber(999)).toBe('999')
  })
})
