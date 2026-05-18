import { vi } from 'vitest'

vi.mock('@defra/hapi-tracing', () => ({
  getTraceId: vi.fn()
}))

describe('#loggerOptions', () => {
  let getTraceId
  let loggerOptions

  beforeEach(async () => {
    vi.resetModules()

    // Re-import after reset so mocks are fresh
    const tracing = await import('@defra/hapi-tracing')
    getTraceId = tracing.getTraceId

    const mod =
      await import('../../../../../src/server/common/helpers/logging/logger-options.js')
    loggerOptions = mod.loggerOptions
  })

  describe('mixin()', () => {
    test('Should return empty object when there is no active trace ID', () => {
      getTraceId.mockReturnValue(null)

      const result = loggerOptions.mixin()

      expect(result).toEqual({})
    })

    test('Should return trace object when a trace ID is present', () => {
      getTraceId.mockReturnValue('trace-abc-123')

      const result = loggerOptions.mixin()

      expect(result).toEqual({ trace: { id: 'trace-abc-123' } })
    })

    test('Should not add trace property when traceId is an empty string', () => {
      getTraceId.mockReturnValue('')

      const result = loggerOptions.mixin()

      expect(result).toEqual({})
    })
  })

  describe('loggerOptions shape', () => {
    test('Should export an enabled property', () => {
      expect(typeof loggerOptions.enabled).toBe('boolean')
    })

    test('Should export a level property', () => {
      expect(typeof loggerOptions.level).toBe('string')
    })

    test('Should export ignorePaths containing /health', () => {
      expect(loggerOptions.ignorePaths).toContain('/health')
    })
  })
})
