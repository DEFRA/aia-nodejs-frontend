import { createServer } from '../../../src/server/server.js'
import { statusCodes } from '../../../src/server/common/constants/status-codes.js'
import { getAuthCookie } from '../../../src/server/common/test-helpers/auth-helper.js'
import { vi } from 'vitest'

// ── Helpers ────────────────────────────────────────────────────────────────

function makeDocs(count, overrides = {}) {
  return Array.from({ length: count }, (_, i) => ({
    doc_id: `doc-${i + 1}`,
    file_name: `Document_${i + 1}.docx`,
    uploadedAt: '2026-05-01T10:00:00Z',
    agents: [
      { name: 'Security', inputTokens: 1000, outputTokens: 500 },
      { name: 'Technology', inputTokens: 800, outputTokens: 400 }
    ],
    totalCost: 0.1,
    currency: 'USD',
    ...overrides
  }))
}

function makeApiResponse(docs, total, summaryOverrides = {}) {
  return {
    costUsage: docs,
    pagination: { total },
    summary: {
      totalCost: docs.length * 0.1,
      currency: 'USD',
      totalDocuments: total,
      totalInputTokens: docs.length * 1800,
      totalOutputTokens: docs.length * 900,
      totalTokens: docs.length * 2700,
      ...summaryOverrides
    }
  }
}

// ── Integration tests ──────────────────────────────────────────────────────

describe('#costController', () => {
  let server
  let authCookie
  let originalFetch

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
    authCookie = await getAuthCookie(server)
    originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeApiResponse(makeDocs(4), 4)
    })
  })

  afterAll(async () => {
    global.fetch = originalFetch
    await server.stop({ timeout: 0 })
  })

  test('Should return 200 with cost page', async () => {
    const { statusCode } = await server.inject({
      method: 'GET',
      url: '/cost',
      headers: { cookie: authCookie }
    })

    expect(statusCode).toBe(statusCodes.ok)
  })

  test('Should render page title', async () => {
    const { result } = await server.inject({
      method: 'GET',
      url: '/cost',
      headers: { cookie: authCookie }
    })

    expect(result).toContain('Cost usage')
  })

  test('Should render warning disclaimer', async () => {
    const { result } = await server.inject({
      method: 'GET',
      url: '/cost',
      headers: { cookie: authCookie }
    })

    expect(result).toContain(
      'These figures represent AI token costs for document analysis only. They may not reflect total system costs.'
    )
  })

  test('Should render summary cards', async () => {
    const { result } = await server.inject({
      method: 'GET',
      url: '/cost',
      headers: { cookie: authCookie }
    })

    expect(result).toContain('Total cost')
    expect(result).toContain('Documents analysed')
    expect(result).toContain('Total tokens')
  })

  test('Should show document filenames in table', async () => {
    const { result } = await server.inject({
      method: 'GET',
      url: '/cost',
      headers: { cookie: authCookie }
    })

    expect(result).toContain('Document_1.docx')
    expect(result).toContain('Document_4.docx')
  })

  test('Should show pagination summary for page 1 of multi-page results', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeApiResponse(makeDocs(10), 21)
    })

    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/cost?page=1',
      headers: { cookie: authCookie }
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain(
      'Showing <strong>1</strong> to <strong>10</strong> of <strong>21</strong>'
    )
  })

  test('Should show correct pagination summary for page 2', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeApiResponse(makeDocs(10), 21)
    })

    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/cost?page=2',
      headers: { cookie: authCookie }
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain(
      'Showing <strong>11</strong> to <strong>20</strong> of <strong>21</strong>'
    )
  })

  test('Should clamp out-of-range page to last valid page', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeApiResponse(makeDocs(4), 4)
    })

    const { statusCode } = await server.inject({
      method: 'GET',
      url: '/cost?page=99999',
      headers: { cookie: authCookie }
    })

    expect(statusCode).toBe(statusCodes.ok)
  })

  test('Should clamp negative page to page 1', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeApiResponse(makeDocs(4), 4)
    })

    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/cost?page=-1',
      headers: { cookie: authCookie }
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain('Showing <strong>1</strong>')
  })

  test('Should default to page 1 for non-numeric page param', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeApiResponse(makeDocs(4), 4)
    })

    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/cost?page=abc',
      headers: { cookie: authCookie }
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain('Showing <strong>1</strong>')
  })

  test('Should fall back to dummy JSON when API is unavailable', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))

    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/cost',
      headers: { cookie: authCookie }
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain('Cost usage')
  })
})

// ── Unit tests ─────────────────────────────────────────────────────────────

describe('#costController - unit tests', () => {
  let configGetMock

  beforeEach(async () => {
    vi.resetModules()
    configGetMock = vi.fn()

    vi.doMock('../../../src/config/config.js', () => ({
      config: { get: configGetMock }
    }))
  })

  afterEach(() => {
    vi.doUnmock('../../../src/config/config.js')
  })

  function mockConfig(overrides = {}) {
    configGetMock.mockImplementation((key) => {
      if (key in overrides) return overrides[key]
      if (key === 'backendApiUrl') return 'http://api.example.com/api/v1'
      if (key === 'pagination.itemsPerPage') return 10
      if (key === 'pagination.alignment') return 'left'
      if (key === 'jwtSecret') return 'test-secret-key-at-least-32-chars-x'
      return null
    })
  }

  async function buildHandler() {
    const mod = await import('../../../src/server/cost/controller.js')
    return mod.costController.handler
  }

  function buildContext(queryPage = 1) {
    return {
      request: {
        query: { page: queryPage },
        yar: { get: vi.fn() },
        logger: { error: vi.fn(), info: vi.fn() }
      },
      h: { view: vi.fn((template, data) => data) }
    }
  }

  test('Should use API data when fetch returns ok', async () => {
    mockConfig()

    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        costUsage: makeDocs(3),
        pagination: { total: 3 },
        summary: {
          totalCost: 0.3,
          currency: 'USD',
          totalDocuments: 3,
          totalInputTokens: 5400,
          totalOutputTokens: 2700,
          totalTokens: 8100
        }
      })
    })

    const handler = await buildHandler()
    const { request, h } = buildContext()
    const result = await handler(request, h)

    expect(result.costUsage).toHaveLength(3)
    expect(result.summary.totalDocuments).toBe(3)
    expect(result.pagination.summary.totalItems).toBe(3)

    global.fetch = originalFetch
  })

  test('Should fall back to JSON when API returns non-ok status', async () => {
    mockConfig()

    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 })

    const handler = await buildHandler()
    const { request, h } = buildContext()
    const result = await handler(request, h)

    expect(request.logger.error).toHaveBeenCalled()
    expect(result.costUsage.length).toBeGreaterThan(0)

    global.fetch = originalFetch
  })

  test('Should fall back to JSON when fetch throws a network error', async () => {
    mockConfig()

    const originalFetch = global.fetch
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))

    const handler = await buildHandler()
    const { request, h } = buildContext()
    const result = await handler(request, h)

    expect(request.logger.error).toHaveBeenCalled()
    expect(result.costUsage.length).toBeGreaterThan(0)

    global.fetch = originalFetch
  })

  test('Should enrich agent data with totalTokens', async () => {
    mockConfig()

    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        costUsage: [
          {
            doc_id: 'doc-1',
            file_name: 'Test.docx',
            uploadedAt: '2026-05-01T10:00:00Z',
            agents: [
              { name: 'Security', inputTokens: 1000, outputTokens: 500 },
              { name: 'Technology', inputTokens: 800, outputTokens: 400 }
            ],
            totalCost: 0.1,
            currency: 'USD'
          }
        ],
        pagination: { total: 1 },
        summary: {
          totalCost: 0.1,
          currency: 'USD',
          totalDocuments: 1,
          totalInputTokens: 1800,
          totalOutputTokens: 900,
          totalTokens: 2700
        }
      })
    })

    const handler = await buildHandler()
    const { request, h } = buildContext()
    const result = await handler(request, h)

    const doc = result.costUsage[0]
    expect(doc.agents[0].totalTokens).toBe(1500)
    expect(doc.agents[1].totalTokens).toBe(1200)
    expect(doc.totalInputTokens).toBe(1800)
    expect(doc.totalOutputTokens).toBe(900)
    expect(doc.totalDocTokens).toBe(2700)

    global.fetch = originalFetch
  })

  test('Should enrich doc with no agents gracefully', async () => {
    mockConfig()

    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        costUsage: [
          {
            doc_id: 'doc-1',
            file_name: 'Empty.docx',
            uploadedAt: '2026-05-01T10:00:00Z',
            agents: [],
            totalCost: 0,
            currency: 'USD'
          }
        ],
        pagination: { total: 1 },
        summary: {
          totalCost: 0,
          currency: 'USD',
          totalDocuments: 1,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalTokens: 0
        }
      })
    })

    const handler = await buildHandler()
    const { request, h } = buildContext()
    const result = await handler(request, h)

    const doc = result.costUsage[0]
    expect(doc.agents).toHaveLength(0)
    expect(doc.totalInputTokens).toBe(0)
    expect(doc.totalOutputTokens).toBe(0)
    expect(doc.totalDocTokens).toBe(0)

    global.fetch = originalFetch
  })

  test('Should set pagination.previous to null on page 1', async () => {
    mockConfig()

    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeApiResponse(makeDocs(10), 21)
    })

    const handler = await buildHandler()
    const { request, h } = buildContext(1)
    const result = await handler(request, h)

    expect(result.pagination.previous).toBeNull()
    expect(result.pagination.next).not.toBeNull()

    global.fetch = originalFetch
  })

  test('Should set pagination.next to null on last page', async () => {
    mockConfig()

    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeApiResponse(makeDocs(1), 21)
    })

    const handler = await buildHandler()
    const { request, h } = buildContext(3)
    const result = await handler(request, h)

    expect(result.pagination.next).toBeNull()
    expect(result.pagination.previous).not.toBeNull()

    global.fetch = originalFetch
  })

  test('Should have no pagination items for single-page results', async () => {
    mockConfig()

    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeApiResponse(makeDocs(3), 3)
    })

    const handler = await buildHandler()
    const { request, h } = buildContext(1)
    const result = await handler(request, h)

    expect(result.pagination.items).toHaveLength(0)
    expect(result.pagination.previous).toBeNull()
    expect(result.pagination.next).toBeNull()

    global.fetch = originalFetch
  })

  test('Should generate pagination items for multi-page results', async () => {
    mockConfig()

    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeApiResponse(makeDocs(10), 30)
    })

    const handler = await buildHandler()
    const { request, h } = buildContext(1)
    const result = await handler(request, h)

    expect(result.pagination.items.length).toBeGreaterThan(0)
    const currentPage = result.pagination.items.find((item) => item.current)
    expect(currentPage).toBeDefined()
    expect(currentPage.number).toBe(1)

    global.fetch = originalFetch
  })

  test('Should include ellipsis in pagination items for large page ranges', async () => {
    mockConfig()

    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeApiResponse(makeDocs(10), 100)
    })

    const handler = await buildHandler()
    const { request, h } = buildContext(5)
    const result = await handler(request, h)

    const hasEllipsis = result.pagination.items.some((item) => item.ellipsis)
    expect(hasEllipsis).toBe(true)

    global.fetch = originalFetch
  })

  test('Should generate correct page hrefs in pagination items', async () => {
    mockConfig()

    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeApiResponse(makeDocs(10), 30)
    })

    const handler = await buildHandler()
    const { request, h } = buildContext(2)
    const result = await handler(request, h)

    const pageItems = result.pagination.items.filter((item) => !item.ellipsis)
    pageItems.forEach((item) => {
      expect(item.href).toBe(`?page=${item.number}`)
    })

    global.fetch = originalFetch
  })

  test('Should set startItem to 0 when there are no results', async () => {
    mockConfig()

    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeApiResponse([], 0)
    })

    const handler = await buildHandler()
    const { request, h } = buildContext(1)
    const result = await handler(request, h)

    expect(result.pagination.summary.startItem).toBe(0)
    expect(result.pagination.summary.totalItems).toBe(0)

    global.fetch = originalFetch
  })

  test('Should slice fallback data to correct page when API is unavailable', async () => {
    mockConfig({ 'pagination.itemsPerPage': 2 })

    const originalFetch = global.fetch
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))

    const handler = await buildHandler()
    const { request, h } = buildContext(2)
    const result = await handler(request, h)

    expect(result.costUsage).toHaveLength(2)
    expect(result.pagination.summary.startItem).toBe(3)

    global.fetch = originalFetch
  })

  test('Should pass paginationAlignment from config to view', async () => {
    mockConfig({ 'pagination.alignment': 'right' })

    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeApiResponse(makeDocs(2), 2)
    })

    const handler = await buildHandler()
    const { request, h } = buildContext()
    const result = await handler(request, h)

    expect(result.paginationAlignment).toBe('right')

    global.fetch = originalFetch
  })

  test('Should set pageTitle in view data', async () => {
    mockConfig()

    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeApiResponse(makeDocs(2), 2)
    })

    const handler = await buildHandler()
    const { request, h } = buildContext()
    const result = await handler(request, h)

    expect(result.pageTitle).toBe('Cost Usage')

    global.fetch = originalFetch
  })

  test('Should include summary data from API in view', async () => {
    mockConfig()

    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        costUsage: makeDocs(2),
        pagination: { total: 2 },
        summary: {
          totalCost: 0.5,
          currency: 'GBP',
          totalDocuments: 2,
          totalInputTokens: 3600,
          totalOutputTokens: 1800,
          totalTokens: 5400
        }
      })
    })

    const handler = await buildHandler()
    const { request, h } = buildContext()
    const result = await handler(request, h)

    expect(result.summary.totalCost).toBe(0.5)
    expect(result.summary.currency).toBe('GBP')
    expect(result.summary.totalInputTokens).toBe(3600)
    expect(result.summary.totalOutputTokens).toBe(1800)

    global.fetch = originalFetch
  })

  test('Should use fallback summary when API body has no summary field', async () => {
    mockConfig()

    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        costUsage: makeDocs(1),
        pagination: { total: 1 }
      })
    })

    const handler = await buildHandler()
    const { request, h } = buildContext()
    const result = await handler(request, h)

    expect(result.summary).toBeNull()

    global.fetch = originalFetch
  })

  test('Should use pagination total from API when present', async () => {
    mockConfig()

    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        costUsage: makeDocs(5),
        pagination: { total: 50 },
        summary: {
          totalCost: 5,
          currency: 'USD',
          totalDocuments: 50,
          totalInputTokens: 9000,
          totalOutputTokens: 4500,
          totalTokens: 13500
        }
      })
    })

    const handler = await buildHandler()
    const { request, h } = buildContext(1)
    const result = await handler(request, h)

    expect(result.pagination.summary.totalItems).toBe(50)

    global.fetch = originalFetch
  })
})
