import { createServer } from '../server.js'
import { statusCodes } from '../common/constants/status-codes.js'
import { getAuthCookie } from '../common/test-helpers/auth-helper.js'
import { vi } from 'vitest'

describe('#homeController', () => {
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

  test('Should provide expected response', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/home',
      headers: { cookie: authCookie }
    })

    expect(result).toContain('AI Assure Architecture Governance')
    expect(statusCode).toBe(statusCodes.ok)
  })

  test('Should show first 10 records on page 1', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/home?page=1',
      headers: { cookie: authCookie }
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain(
      'Showing <strong>1</strong> to <strong>10</strong>'
    )
  })

  test('Should show records 11 to 20 on page 2', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/home?page=2',
      headers: { cookie: authCookie }
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain(
      'Showing <strong>11</strong> to <strong>20</strong>'
    )
  })

  test('Should clamp out-of-range page number to last valid page', async () => {
    const { statusCode } = await server.inject({
      method: 'GET',
      url: '/home?page=99999',
      headers: { cookie: authCookie }
    })

    expect(statusCode).toBe(statusCodes.ok)
  })

  test('Should clamp negative page number to page 1', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/home?page=-5',
      headers: { cookie: authCookie }
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain('Showing <strong>1</strong>')
  })

  test('Should default to page 1 when page param is non-numeric', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/home?page=abc',
      headers: { cookie: authCookie }
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain('Showing <strong>1</strong>')
  })
})

describe('#uploadController', () => {
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

  test('Should redirect to /home after POST upload', async () => {
    const { statusCode, headers } = await server.inject({
      method: 'POST',
      url: '/upload',
      headers: {
        'content-type': 'multipart/form-data; boundary=----testboundary',
        cookie: authCookie
      },
      payload:
        '------testboundary\r\nContent-Disposition: form-data; name="templateType"\r\n\r\nSDA\r\n------testboundary--'
    })

    expect(statusCode).toBe(302)
    expect(headers.location).toBe('/home')
  })
})

describe('#homeController - API mode (mocked fetch)', () => {
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

  function mockConfig(overrides = {}) {
    configGetMock.mockImplementation((key) => {
      if (key in overrides) return overrides[key]
      if (key === 'backendApiUrl') return 'http://api.example.com/api/v1'
      if (key === 'pagination.itemsPerPage') return 10
      if (key === 'pagination.alignment') return 'centre'
      if (key === 'upload.maxFileSizeMb') return 5
      return null
    })
  }

  async function buildHandler() {
    const mod = await import('./controller.js')
    return mod.homeController.handler
  }

  function buildContext(queryPage = 1) {
    return {
      request: {
        query: { page: queryPage },
        yar: { flash: vi.fn().mockReturnValue([]), get: vi.fn() },
        logger: { error: vi.fn(), info: vi.fn() }
      },
      h: { view: vi.fn((template, data) => data) }
    }
  }

  test('Should use backend data when API returns ok response', async () => {
    mockConfig()

    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        documents: [
          {
            originalFilename: 'doc1.docx',
            status: 'COMPLETE',
            documentId: '1'
          },
          {
            originalFilename: 'doc2.docx',
            status: 'PROCESSING',
            documentId: '2'
          }
        ],
        total: 2,
        page: 1,
        limit: 10
      })
    })

    const handler = await buildHandler()
    const { request, h } = buildContext()

    const result = await handler(request, h)

    expect(result.uploads).toHaveLength(2)
    expect(result.uploads[0].originalFilename).toBe('doc1.docx')
    expect(result.pagination.summary.totalItems).toBe(2)

    global.fetch = originalFetch
  })

  test('Should fall back to mock data when API returns non-ok', async () => {
    mockConfig()

    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500
    })

    const handler = await buildHandler()
    const { request, h } = buildContext()

    const result = await handler(request, h)

    // Falls back to uploads.json data
    expect(result.uploads.length).toBeGreaterThan(0)

    global.fetch = originalFetch
  })

  test('Should fall back to mock data when fetch throws network error', async () => {
    mockConfig()

    const originalFetch = global.fetch
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))

    const handler = await buildHandler()
    const { request, h } = buildContext()

    const result = await handler(request, h)

    expect(request.logger.error).toHaveBeenCalled()
    expect(result.uploads.length).toBeGreaterThan(0)

    global.fetch = originalFetch
  })

  test('Should build server-side pagination when API returns total > itemsPerPage', async () => {
    mockConfig()

    const docs = Array.from({ length: 10 }, (_, i) => ({
      originalFilename: `doc${i}.docx`,
      status: 'COMPLETE',
      documentId: `id-${i}`
    }))

    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        documents: docs,
        total: 25,
        page: 1,
        limit: 10
      })
    })

    const handler = await buildHandler()
    const { request, h } = buildContext(1)

    const result = await handler(request, h)

    expect(result.pagination.summary.totalItems).toBe(25)
    expect(result.pagination.next).not.toBeNull()

    global.fetch = originalFetch
  })

  test('Should include uploadError from flash session', async () => {
    mockConfig()

    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ documents: [], total: 0, page: 1, limit: 10 })
    })

    const handler = await buildHandler()
    const { request, h } = buildContext()
    request.yar.flash = vi.fn().mockReturnValue(['Please select a file'])

    const result = await handler(request, h)

    expect(result.uploadError).toBe('Please select a file')
    expect(result.pageTitle).toContain('Error')

    global.fetch = originalFetch
  })
})

describe('#uploadController - unit tests', () => {
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

  function mockConfig() {
    configGetMock.mockImplementation((key) => {
      if (key === 'backendApiUrl') return 'http://api.example.com/api/v1'
      if (key === 'upload.maxFileSizeMb') return 5
      return null
    })
  }

  async function buildHandler() {
    const mod = await import('./controller.js')
    return mod.uploadController.handler
  }

  test('Should flash error and redirect when no file in payload', async () => {
    mockConfig()

    const handler = await buildHandler()
    const flash = vi.fn()
    const request = {
      payload: { templateType: 'SDA' },
      yar: { flash },
      logger: { info: vi.fn(), error: vi.fn() }
    }
    const h = { redirect: vi.fn().mockReturnValue('redirect') }

    await handler(request, h)

    expect(flash).toHaveBeenCalledWith('uploadError', 'Please select a file')
    expect(h.redirect).toHaveBeenCalledWith('/home')
  })

  test('Should call backend and redirect on successful upload', async () => {
    mockConfig()

    const fileContent = Buffer.from('test content')
    const fileStream = (async function* () {
      yield fileContent
    })()
    fileStream.hapi = { filename: 'test.docx' }

    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ documentId: 'new-doc-1' })
    })

    const handler = await buildHandler()
    const flash = vi.fn()
    const request = {
      payload: { file: fileStream, templateType: 'SDA' },
      yar: { flash, get: vi.fn() },
      logger: { info: vi.fn(), error: vi.fn() }
    }
    const h = { redirect: vi.fn().mockReturnValue('redirect') }

    await handler(request, h)

    expect(global.fetch).toHaveBeenCalledWith(
      'http://api.example.com/api/v1/documents/upload',
      expect.objectContaining({ method: 'POST' })
    )
    expect(h.redirect).toHaveBeenCalledWith('/home')
    expect(flash).not.toHaveBeenCalled()

    global.fetch = originalFetch
  })

  test('Should flash error when backend returns error status', async () => {
    mockConfig()

    const fileContent = Buffer.from('test content')
    const fileStream = (async function* () {
      yield fileContent
    })()
    fileStream.hapi = { filename: 'test.docx' }

    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ statusCode: 400, errorMessage: 'Invalid file type' })
    })

    const handler = await buildHandler()
    const flash = vi.fn()
    const request = {
      payload: { file: fileStream, templateType: 'SDA' },
      yar: { flash, get: vi.fn() },
      logger: { info: vi.fn(), error: vi.fn() }
    }
    const h = { redirect: vi.fn().mockReturnValue('redirect') }

    await handler(request, h)

    expect(flash).toHaveBeenCalledWith('uploadError', 'Invalid file type')
    expect(h.redirect).toHaveBeenCalledWith('/home')

    global.fetch = originalFetch
  })

  test('Should flash network error when fetch throws', async () => {
    mockConfig()

    const fileContent = Buffer.from('test content')
    const fileStream = (async function* () {
      yield fileContent
    })()
    fileStream.hapi = { filename: 'test.docx' }

    const originalFetch = global.fetch
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))

    const handler = await buildHandler()
    const flash = vi.fn()
    const request = {
      payload: { file: fileStream, templateType: 'SDA' },
      yar: { flash, get: vi.fn() },
      logger: { info: vi.fn(), error: vi.fn() }
    }
    const h = { redirect: vi.fn().mockReturnValue('redirect') }

    await handler(request, h)

    expect(flash).toHaveBeenCalledWith(
      'uploadError',
      expect.stringContaining('network error')
    )

    global.fetch = originalFetch
  })
})
