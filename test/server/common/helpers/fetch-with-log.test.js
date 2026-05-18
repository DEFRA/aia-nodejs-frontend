import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync, writeFileSync } from 'fs'
import { config } from '../../../../src/config/config.js'
import { fetchWithLog } from '../../../../src/server/common/helpers/fetch-with-log.js'

vi.mock('fs', () => ({
  readFileSync: vi.fn().mockReturnValue(''),
  writeFileSync: vi.fn()
}))

vi.mock('../../../../src/config/config.js', () => ({
  config: { get: vi.fn() }
}))

describe('fetchWithLog', () => {
  let logger
  let originalFetch

  beforeEach(() => {
    logger = { debug: vi.fn() }
    originalFetch = global.fetch
    vi.clearAllMocks()
    readFileSync.mockReturnValue('')
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  function mockFetch(response) {
    global.fetch = vi.fn().mockResolvedValue({
      ...response,
      clone: () => ({ text: async () => response.responseText ?? '' })
    })
  }

  function enableLogging({ file = false } = {}) {
    config.get.mockImplementation((key) => {
      if (key === 'generateLog') return true
      if (key === 'generateLogFile') return file
      return null
    })
  }

  function disableLogging() {
    config.get.mockImplementation(() => false)
  }

  test('returns the fetch response regardless of flags', async () => {
    disableLogging()
    mockFetch({ status: 200, ok: true })

    const res = await fetchWithLog('http://api/test', {}, logger)

    expect(res.status).toBe(200)
  })

  test('does not log when GENERATE_LOG is false', async () => {
    disableLogging()
    mockFetch({ status: 200 })

    await fetchWithLog('http://api/test', {}, logger)

    expect(logger.debug).not.toHaveBeenCalled()
    expect(writeFileSync).not.toHaveBeenCalled()
  })

  test('emits debug logs when GENERATE_LOG is true', async () => {
    enableLogging()
    mockFetch({ status: 200, responseText: 'ok' })

    await fetchWithLog('http://api/docs', { method: 'GET' }, logger)

    expect(logger.debug).toHaveBeenCalledWith(
      { url: 'http://api/docs', method: 'GET', body: null },
      'backend request →'
    )
    expect(logger.debug).toHaveBeenCalledWith(
      { url: 'http://api/docs', status: 200, body: 'ok' },
      'backend response ←'
    )
  })

  test('does not write log file when GENERATE_LOG_FILE is false', async () => {
    enableLogging({ file: false })
    mockFetch({ status: 200 })

    await fetchWithLog('http://api/docs', {}, logger)

    expect(writeFileSync).not.toHaveBeenCalled()
  })

  test('writes log file when both GENERATE_LOG and GENERATE_LOG_FILE are true', async () => {
    enableLogging({ file: true })
    mockFetch({ status: 200, responseText: '{"ok":true}' })

    await fetchWithLog('http://api/docs', { method: 'GET' }, logger)

    expect(writeFileSync).toHaveBeenCalledTimes(2)
    const requestEntry = writeFileSync.mock.calls[0][1]
    const responseEntry = writeFileSync.mock.calls[1][1]
    expect(requestEntry).toContain('→ GET http://api/docs')
    expect(responseEntry).toContain('← GET http://api/docs')
    expect(responseEntry).toContain('Status   : 200')
  })

  test('labels FormData body as [FormData] in the log', async () => {
    enableLogging()
    mockFetch({ status: 200 })

    await fetchWithLog(
      'http://api/upload',
      { method: 'POST', body: new FormData() },
      logger
    )

    expect(logger.debug).toHaveBeenCalledWith(
      { url: 'http://api/upload', method: 'POST', body: '[FormData]' },
      'backend request →'
    )
  })

  test('still returns response when response body clone fails', async () => {
    enableLogging()
    global.fetch = vi.fn().mockResolvedValue({
      status: 500,
      clone: () => ({
        text: async () => {
          throw new Error('stream error')
        }
      })
    })

    const res = await fetchWithLog('http://api/fail', {}, logger)

    expect(res.status).toBe(500)
    expect(logger.debug).toHaveBeenCalledWith(
      { url: 'http://api/fail', status: 500, body: null },
      'backend response ←'
    )
  })

  test('does not throw when logger has no debug method', async () => {
    enableLogging()
    mockFetch({ status: 200 })

    await expect(
      fetchWithLog('http://api/test', {}, { error: vi.fn() })
    ).resolves.not.toThrow()
  })
})
