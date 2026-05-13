import { vi } from 'vitest'
import { createServer } from '../server.js'
import { statusCodes } from '../common/constants/status-codes.js'
import { getAuthCookie } from '../common/test-helpers/auth-helper.js'

describe('#policyDocumentsController', () => {
  let server
  let authCookie
  let originalFetch

  function makeDefaultFetch() {
    return vi.fn(async (url) => {
      if (String(url).includes('/policy-documents/options')) {
        return {
          ok: true,
          json: async () => ({
            sources: ['SharePoint', 'Confluence', 'GitHub'],
            categories: ['Security', 'Technology']
          })
        }
      }

      const urlObj = new URL(url)
      const page = Number(urlObj.searchParams.get('page') ?? 1)

      return {
        ok: true,
        json: async () => ({
          documents: Array.from({ length: 10 }, (_, i) => ({
            urlId: (page - 1) * 10 + i + 1,
            filename: `Policy Document ${page}-${i + 1}`,
            category: 'Architecture',
            source: 'SharePoint',
            url: `https://example.com/policies/${page}-${i + 1}`,
            isActive: true,
            updatedAt: '2026-04-10T09:30:00.000Z'
          })),
          total: 25,
          page,
          limit: 10
        })
      }
    })
  }

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
    authCookie = await getAuthCookie(server)
    originalFetch = global.fetch

    global.fetch = makeDefaultFetch()
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
    expect(result).toContain('Policy Documents')
    expect(result).toContain('Title/Filename')
    expect(result).toContain('Source')
    expect(result).not.toContain('Document ID')
    expect(result).toContain('>Edit</a>')
    expect(result).not.toContain('Edit Metadata')
    expect(result).not.toContain('Edit Content')
    expect(result).toContain('/policy-documents/edit?documentId=1')
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

    global.fetch = makeDefaultFetch()
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
            urlId: 999,
            filename: 'Unsafe URL test',
            category: 'Security',
            source: 'SharePoint',
            url: 'javascript:alert(1)',
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

    global.fetch = makeDefaultFetch()
  })

  test('Should open edit page for selected document', async () => {
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (String(url).includes('/policy-documents/options')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            sources: ['SharePoint', 'Confluence', 'GitHub'],
            categories: ['Security', 'Technology']
          })
        })
      }

      if (String(url).match(/\/policy-documents\/\d+$/) && !options?.method) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            urlId: 1,
            filename: 'Policy Document 1-1',
            category: 'Architecture',
            source: 'SharePoint',
            url: 'https://example.com/policies/1-1',
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
            urlId: (page - 1) * 10 + i + 1,
            filename: `Policy Document ${page}-${i + 1}`,
            category: 'Architecture',
            source: 'SharePoint',
            url: `https://example.com/policies/${page}-${i + 1}`,
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
      url: '/policy-documents/edit?documentId=1',
      headers: { cookie: authCookie }
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain('Edit Policy Document')
    expect(result).toContain('Title/Filename')
    expect(result).toContain('>Source</label>')
    expect(result).toContain('<option value="Security"')
    expect(result).toContain('<option value="Technology"')
    expect(result).toContain('<option value="SharePoint"')
    expect(result).toContain('<option value="Confluence"')
    expect(result).toContain('<option value="GitHub"')
    expect(result).toContain('Save Changes')

    global.fetch = makeDefaultFetch()
  })

  test('Should save policy document changes via PUT API', async () => {
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (String(url).includes('/policy-documents/options')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            sources: ['SharePoint', 'Confluence', 'GitHub'],
            categories: ['Security', 'Technology']
          })
        })
      }

      if (
        String(url).match(/\/policy-documents\/\d+$/) &&
        options?.method === 'PUT'
      ) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            urlId: 1,
            filename: 'Updated Policy',
            category: 'security',
            source: 'Confluence',
            url: 'https://example.com/updated',
            isActive: true
          })
        })
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({ documents: [], total: 0, page: 1, limit: 10 })
      })
    })

    const { result, statusCode } = await server.inject({
      method: 'POST',
      url: '/policy-documents/edit',
      headers: { cookie: authCookie },
      payload: {
        documentId: '1',
        title: 'Updated Policy',
        sourceUrl: 'https://example.com/updated',
        category: 'security',
        type: 'Confluence',
        isActive: 'true'
      }
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain('Policy document updated successfully')

    global.fetch = makeDefaultFetch()
  })

  test('Should show validation error when source is not allowed', async () => {
    const { result, statusCode } = await server.inject({
      method: 'POST',
      url: '/policy-documents/edit',
      headers: { cookie: authCookie },
      payload: {
        documentId: '1',
        title: 'Updated Policy',
        sourceUrl: 'https://example.com/updated',
        category: 'Security',
        type: 'NotAllowedSource',
        isActive: 'true'
      }
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain('There is a problem')
    expect(result).toContain('Select a valid source')
  })

  test('Should show validation error when category exceeds backend limit', async () => {
    const { result, statusCode } = await server.inject({
      method: 'POST',
      url: '/policy-documents/edit',
      headers: { cookie: authCookie },
      payload: {
        documentId: '1',
        title: 'Updated Policy',
        sourceUrl: 'https://example.com/updated',
        category: 'a'.repeat(101),
        type: 'Confluence',
        isActive: 'true'
      }
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain('There is a problem')
    expect(result).toContain('Category must be 100 characters or fewer')
  })

  test('Should treat non-integer documentId as not found on edit submit', async () => {
    const { result, statusCode } = await server.inject({
      method: 'POST',
      url: '/policy-documents/edit',
      headers: { cookie: authCookie },
      payload: {
        documentId: 'abc',
        title: 'Updated Policy',
        sourceUrl: 'https://example.com/updated',
        category: 'Security',
        type: 'Confluence',
        isActive: 'true'
      }
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain('could not be found')
  })

  test('Should escape document title HTML in list page output', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        documents: [
          {
            urlId: 10,
            filename: '<img src=x onerror=alert(1)>Unsafe</img>',
            category: 'Security',
            source: 'SharePoint',
            url: 'https://example.com/safe-link',
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
    expect(result).toContain(
      '&lt;img src=x onerror=alert(1)&gt;Unsafe&lt;/img&gt;'
    )
    expect(result).not.toContain('<img src=x onerror=alert(1)>')

    global.fetch = makeDefaultFetch()
  })

  test('Should delete policy document and redirect to list', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({})
    })

    const { statusCode, headers } = await server.inject({
      method: 'POST',
      url: '/policy-documents/delete',
      headers: { cookie: authCookie },
      payload: { documentId: '1' }
    })

    expect(statusCode).toBe(302)
    expect(headers.location).toBe('/policy-documents')

    global.fetch = makeDefaultFetch()
  })
})
