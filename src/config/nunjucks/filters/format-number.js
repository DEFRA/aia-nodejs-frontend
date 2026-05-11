/**
 * Nunjucks filter: formats a number with thousands separators using en-GB locale.
 * Returns an empty string for null/undefined values.
 */
export function formatNumber(value) {
  if (value === null || value === undefined || value === '') return ''
  const num = Number(value)
  if (isNaN(num)) return value
  return num.toLocaleString('en-GB')
}
