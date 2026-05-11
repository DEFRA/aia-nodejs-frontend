import { vi } from 'vitest'
import { createServer } from '../server.js'
import { statusCodes } from '../common/constants/status-codes.js'
import { getAuthCookie } from '../common/test-helpers/auth-helper.js'

describe('#policyDocumentsController', () => {
  let server
  let authCookie
  let originalFetch

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
    authCookie = await getAuthCookie(server)
    originalFetch = global.fetch

    global.fetch = vi.fn(async (url) => {
      const urlObj = new URL(url)
      const page = Number(urlObj.searchParams.get('page') ?? 1)

      return {
        ok: true,
        json: async () => ({
          documents: Array.from({ length: 10 }, (_, i) => ({
            documentId: `PD-${page}-${i + 1}`,
            title: `Policy Document ${page}-${i + 1}`,
            category: 'Architecture',
            type: 'Standard',
            sourceUrl: `https://example.com/policies/${page}-${i + 1}`,
            isActive: true,
            updatedAt: '2026-04-10T09:30:00.000Z'
          })),
          total: 25,
          page,
          limit: 10
        })
      }
    })
  })

  afterAll(async () => {
    global.fetch = originalFetch
    await server.stop({ timeout: 0 })
  })

  test('Should return 200 and render PolicyDocuments page', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/policy-documents',
      headers: { cookie: authCookie }
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain('PolicyDocuments')
    expect(result).toContain('Title/FileName')
    expect(result).toContain('Source')
    expect(result).not.toContain('Document ID')
    expect(result).toContain('>Edit</a>')
    expect(result).not.toContain('Edit Metadata')
    expect(result).not.toContain('Edit Content')
    expect(result).toContain('/policy-documents/edit?documentId=PD-1-1')
  })

  test('Should show records 11 to 20 on page 2', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/policy-documents?page=2',
      headers: { cookie: authCookie }
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain(
      'Showing <strong>11</strong> to <strong>20</strong>'
    )
  })

  test('Should clamp negative page number to page 1', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/policy-documents?page=-5',
      headers: { cookie: authCookie }
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain('Showing <strong>1</strong>')
  })

  test('Should fall back to local mock data when API fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'))

    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/policy-documents?page=1',
      headers: { cookie: authCookie }
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain('Cloud Security Policy')

    global.fetch = vi.fn(async (url) => {
      const urlObj = new URL(url)
      const page = Number(urlObj.searchParams.get('page') ?? 1)

      return {
        ok: true,
        json: async () => ({
          documents: Array.from({ length: 10 }, (_, i) => ({
            documentId: `PD-${page}-${i + 1}`,
            title: `Policy Document ${page}-${i + 1}`,
            category: 'Architecture',
            type: 'Standard',
            sourceUrl: `https://example.com/policies/${page}-${i + 1}`,
            isActive: true,
            updatedAt: '2026-04-10T09:30:00.000Z'
          })),
          total: 25,
          page,
          limit: 10
        })
      }
    })
  })

  test('Should redirect /PolicyDocuments to /policy-documents', async () => {
    const { statusCode, headers } = await server.inject({
      method: 'GET',
      url: '/PolicyDocuments',
      headers: { cookie: authCookie }
    })

    expect(statusCode).toBe(302)
    expect(headers.location).toBe('/policy-documents')
  })

  test('Should redirect to / when not authenticated', async () => {
    const { statusCode, headers } = await server.inject({
      method: 'GET',
      url: '/policy-documents'
    })

    expect(statusCode).toBe(302)
    expect(headers.location).toBe('/')
  })

  test('Should not render unsafe source URLs from API', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        documents: [
          {
            documentId: 'PD-XSS-1',
            title: 'Unsafe URL test',
            category: 'Security',
            type: 'Policy',
            sourceUrl: 'javascript:alert(1)',
            isActive: true,
            updatedAt: '2026-04-10T09:30:00.000Z'
          }
        ],
        total: 1,
        page: 1,
        limit: 10
      })
    })

    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/policy-documents',
      headers: { cookie: authCookie }
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).not.toContain('href="javascript:alert(1)"')
    expect(result).toContain('Unsafe URL test')

    global.fetch = vi.fn(async (url) => {
      const urlObj = new URL(url)
      const page = Number(urlObj.searchParams.get('page') ?? 1)

      return {
        ok: true,
        json: async () => ({
          documents: Array.from({ length: 10 }, (_, i) => ({
            documentId: `PD-${page}-${i + 1}`,
            title: `Policy Document ${page}-${i + 1}`,
            category: 'Architecture',
            type: 'Standard',
            sourceUrl: `https://example.com/policies/${page}-${i + 1}`,
            isActive: true,
            updatedAt: '2026-04-10T09:30:00.000Z'
          })),
          total: 25,
          page,
          limit: 10
        })
      }
    })
  })

  test('Should open edit page for selected document', async () => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (String(url).includes('/policy-documents/PD-1-1')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            documentId: 'PD-1-1',
            title: 'Policy Document 1-1',
            category: 'Architecture',
            type: 'Standard',
            sourceUrl: 'https://example.com/policies/1-1',
            isActive: true
          })
        })
      }

      const urlObj = new URL(url)
      const page = Number(urlObj.searchParams.get('page') ?? 1)

      return Promise.resolve({
        ok: true,
        json: async () => ({
          documents: Array.from({ length: 10 }, (_, i) => ({
            documentId: `PD-${page}-${i + 1}`,
            title: `Policy Document ${page}-${i + 1}`,
            category: 'Architecture',
            type: 'Standard',
            sourceUrl: `https://example.com/policies/${page}-${i + 1}`,
            isActive: true,
            updatedAt: '2026-04-10T09:30:00.000Z'
          })),
          total: 25,
          page,
          limit: 10
        })
      })
    })

    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/policy-documents/edit?documentId=PD-1-1',
      headers: { cookie: authCookie }
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain('Edit Policy Document')
    expect(result).toContain('Title/FileName')
    expect(result).toContain('>Source</label>')
    expect(result).toContain('<option value="Security"')
    expect(result).toContain('<option value="Technology"')
    expect(result).toContain('<option value="SharePoint"')
    expect(result).toContain('<option value="Confluence"')
    expect(result).toContain('<option value="GitHub"')
    expect(result).toContain('Save Changes')

    global.fetch = vi.fn(async (url) => {
      const urlObj = new URL(url)
      const page = Number(urlObj.searchParams.get('page') ?? 1)

      return {
        ok: true,
        json: async () => ({
          documents: Array.from({ length: 10 }, (_, i) => ({
            documentId: `PD-${page}-${i + 1}`,
            title: `Policy Document ${page}-${i + 1}`,
            category: 'Architecture',
            type: 'Standard',
            sourceUrl: `https://example.com/policies/${page}-${i + 1}`,
            isActive: true,
            updatedAt: '2026-04-10T09:30:00.000Z'
          })),
          total: 25,
          page,
          limit: 10
        })
      }
    })
  })
})
