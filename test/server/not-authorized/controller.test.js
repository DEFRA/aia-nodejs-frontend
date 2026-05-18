import { createServer } from '../../../src/server/server.js'
import { statusCodes } from '../../../src/server/common/constants/status-codes.js'
import { getAuthCookie } from '../../../src/server/common/test-helpers/auth-helper.js'

describe('#notAuthorizedController', () => {
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

  test('Should return 200 and render the not-authorized page', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/not-authorized',
      headers: { cookie: authCookie }
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain('AI Assure Architecture Governance')
  })
})
