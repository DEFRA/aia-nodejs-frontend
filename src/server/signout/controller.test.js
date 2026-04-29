import { createServer } from '../server.js'
import { statusCodes } from '../common/constants/status-codes.js'
import { getAuthCookie } from '../common/test-helpers/auth-helper.js'

describe('#signoutController', () => {
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

  test('returns 200 and renders the signed-out page', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/signout',
      headers: { cookie: authCookie }
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain('You have signed out')
  })

  test('resets the session so the new cookie can no longer access protected routes', async () => {
    const freshCookie = await getAuthCookie(server)

    const signoutRes = await server.inject({
      method: 'GET',
      url: '/signout',
      headers: { cookie: freshCookie }
    })

    // Capture the new (cleared) session cookie set by the sign-out response
    const setCookieHeader = signoutRes.headers['set-cookie']
    const cookies = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : [setCookieHeader]
    const newCookie = cookies.map((c) => c.split(';')[0]).join('; ')

    const { statusCode } = await server.inject({
      method: 'GET',
      url: '/home',
      headers: { cookie: newCookie }
    })

    expect(statusCode).toBe(302)
  })
})
