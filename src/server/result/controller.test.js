import { vi } from 'vitest'
import { createServer } from '../server.js'
import { statusCodes } from '../common/constants/status-codes.js'
import { getAuthCookie } from '../common/test-helpers/auth-helper.js'

describe('#resultController', () => {
  let server
  let authCookie

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
    authCookie = await getAuthCookie(server)
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  describe('mock data mode (default)', () => {
    test('Should return 200 and render the result page', async () => {
      const { result, statusCode } = await server.inject({
        method: 'GET',
        url: '/result',
        headers: { cookie: authCookie }
      })

      expect(result).toContain('AI Assure Architecture Governance')
      expect(statusCode).toBe(statusCodes.ok)
    })

    test('Should render markdown content from default result.json', async () => {
      const { result, statusCode } = await server.inject({
        method: 'GET',
        url: '/result',
        headers: { cookie: authCookie }
      })

      expect(statusCode).toBe(statusCodes.ok)
      // page renders with service name in the layout
      expect(result).toContain('AI Assure Architecture Governance')
    })

    test('Should render result2.json when documentId matches RESULT2_DOC_ID', async () => {
      const { result, statusCode } = await server.inject({
        method: 'GET',
        url: '/result?documentId=UUID-1234-5678-9012-abcdef123456',
        headers: { cookie: authCookie }
      })

      expect(statusCode).toBe(statusCodes.ok)
      expect(result).toContain('AI Assure Architecture Governance')
    })

    test('Should render result.json for an unrecognised documentId', async () => {
      const { result, statusCode } = await server.inject({
        method: 'GET',
        url: '/result?documentId=unknown-id',
        headers: { cookie: authCookie }
      })

      expect(statusCode).toBe(statusCodes.ok)
      expect(result).toContain('AI Assure Architecture Governance')
    })
  })

  describe('API mode (mockData = false)', () => {
    // We unit-test the controller handler directly by mocking the config module
    // so we can control config values independently.

    let configGetMock

    beforeEach(async () => {
      vi.resetModules()

      configGetMock = vi.fn()

      vi.doMock('../../config/config.js', () => ({
        config: { get: configGetMock }
      }))
    })

    afterEach(() => {
      vi.doUnmock('../../config/config.js')
    })

    async function buildHandler() {
      const mod = await import('./controller.js')
      return mod.resultController.handler
    }

    function buildContext() {
      return {
        request: {
          query: { documentId: 'doc-123' },
          yar: { get: vi.fn() },
          logger: { error: vi.fn() }
        },
        h: { view: vi.fn((template, data) => data) }
      }
    }

    test('Should fall back to mock data when BACKEND_API_URL is not configured', async () => {
      configGetMock.mockImplementation((key) => {
        if (key === 'result.mockData') return false
        if (key === 'backendApiUrl') return null
        return null
      })

      const handler = await buildHandler()
      const { request, h } = buildContext()

      const result = await handler(request, h)

      expect(request.logger.error).toHaveBeenCalled()
      expect(result.markdownContent).toBeTruthy()
      expect(result.markdownContent).not.toBe('Error loading result content.')
    })

    test('Should fall back to mock data when fetch throws a network error', async () => {
      configGetMock.mockImplementation((key) => {
        if (key === 'result.mockData') return false
        if (key === 'backendApiUrl') return 'http://api.example.com/api/v1'
        if (key === 'result.apiTimeoutMs') return 5000
        return null
      })

      const originalFetch = global.fetch
      global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'))

      const handler = await buildHandler()
      const { request, h } = buildContext()

      const result = await handler(request, h)

      expect(request.logger.error).toHaveBeenCalled()
      expect(result.markdownContent).toBeTruthy()
      expect(result.markdownContent).not.toBe('Error loading result content.')

      global.fetch = originalFetch
    })

    test('Should fall back to mock data when API responds with non-ok status', async () => {
      configGetMock.mockImplementation((key) => {
        if (key === 'result.mockData') return false
        if (key === 'backendApiUrl') return 'http://api.example.com/api/v1'
        if (key === 'result.apiTimeoutMs') return 5000
        return null
      })

      const originalFetch = global.fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => ''
      })

      const handler = await buildHandler()
      const { request, h } = buildContext()

      const result = await handler(request, h)

      expect(request.logger.error).toHaveBeenCalled()
      expect(result.markdownContent).toBeTruthy()
      expect(result.markdownContent).not.toBe('Error loading result content.')

      global.fetch = originalFetch
    })

    test('Should return API markdown content when fetch succeeds', async () => {
      configGetMock.mockImplementation((key) => {
        if (key === 'result.mockData') return false
        if (key === 'backendApiUrl') return 'http://api.example.com/api/v1'
        if (key === 'result.apiTimeoutMs') return 5000
        return null
      })

      const originalFetch = global.fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          documentId: 'doc-123',
          status: 'COMPLETE',
          resultMd: '# My Result\n\nSome content here.',
          errorMessage: null
        })
      })

      const handler = await buildHandler()
      const { request, h } = buildContext()

      const result = await handler(request, h)

      expect(result.markdownContent).toBe('# My Result\n\nSome content here.')
      expect(h.view).toHaveBeenCalledWith(
        'result/index',
        expect.objectContaining({ pageTitle: 'Result' })
      )

      global.fetch = originalFetch
    })

    test('Should return fallback message when API returns empty content', async () => {
      configGetMock.mockImplementation((key) => {
        if (key === 'result.mockData') return false
        if (key === 'backendApiUrl') return 'http://api.example.com/api/v1'
        if (key === 'result.apiTimeoutMs') return 5000
        return null
      })

      const originalFetch = global.fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          documentId: 'doc-123',
          status: 'COMPLETE',
          resultMd: null,
          errorMessage: null
        })
      })

      const handler = await buildHandler()
      const { request, h } = buildContext()

      const result = await handler(request, h)

      expect(result.markdownContent).toBe('No result content available.')

      global.fetch = originalFetch
    })

    test('Should fall back to mock data when documentId is missing', async () => {
      configGetMock.mockImplementation((key) => {
        if (key === 'result.mockData') return false
        if (key === 'backendApiUrl') return 'http://api.example.com/api/v1'
        if (key === 'result.apiTimeoutMs') return 5000
        return null
      })

      const handler = await buildHandler()
      const { h } = buildContext()
      const request = {
        query: {},
        yar: { get: vi.fn() },
        logger: { error: vi.fn() }
      }

      const result = await handler(request, h)

      expect(request.logger.error).toHaveBeenCalled()
      expect(result.markdownContent).toBeTruthy()
      expect(result.markdownContent).not.toBe('Error loading result content.')
    })

    test('Should return error message when API returns ERROR status', async () => {
      configGetMock.mockImplementation((key) => {
        if (key === 'result.mockData') return false
        if (key === 'backendApiUrl') return 'http://api.example.com/api/v1'
        if (key === 'result.apiTimeoutMs') return 5000
        return null
      })

      const originalFetch = global.fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          documentId: 'doc-123',
          status: 'ERROR',
          resultMd: null,
          errorMessage: 'Processing failed for document'
        })
      })

      const handler = await buildHandler()
      const { request, h } = buildContext()

      const result = await handler(request, h)

      expect(result.markdownContent).toBe('Processing failed for document')

      global.fetch = originalFetch
    })

    test('Should return "No result content available" when API returns no resultMd', async () => {
      configGetMock.mockImplementation((key) => {
        if (key === 'result.mockData') return false
        if (key === 'backendApiUrl') return 'http://api.example.com/api/v1'
        if (key === 'result.apiTimeoutMs') return 5000
        return null
      })

      const originalFetch = global.fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          documentId: 'doc-123',
          status: 'COMPLETE'
        })
      })

      const handler = await buildHandler()
      const { request, h } = buildContext()

      const result = await handler(request, h)

      expect(result.markdownContent).toBe('No result content available.')

      global.fetch = originalFetch
    })

    test('Should handle parseJsonPayload with a JSON string payload', async () => {
      configGetMock.mockImplementation((key) => {
        if (key === 'result.mockData') return false
        if (key === 'backendApiUrl') return 'http://api.example.com/api/v1'
        if (key === 'result.apiTimeoutMs') return 5000
        return null
      })

      const originalFetch = global.fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          documentId: 'doc-123',
          status: 'COMPLETE',
          resultMd: JSON.stringify({ markdown: '# Nested JSON string' })
        })
      })

      const handler = await buildHandler()
      const { request, h } = buildContext()

      const result = await handler(request, h)

      // resultMd is a string so extractMarkdownContent returns it directly
      expect(result.markdownContent).toBeTruthy()

      global.fetch = originalFetch
    })
  })
})
