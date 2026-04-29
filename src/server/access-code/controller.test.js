import { createServer } from '../server.js'
import { statusCodes } from '../common/constants/status-codes.js'

describe('#accessCodeGetController', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('Should return 200 and render the access code page', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/'
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain('Enter access code')
  })

  test('Should not show sign out link on access code page', async () => {
    const { result } = await server.inject({
      method: 'GET',
      url: '/'
    })

    expect(result).not.toContain('Sign out')
  })
})

describe('#accessCodePostController', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('Should show error when access code is empty', async () => {
    const { result, statusCode } = await server.inject({
      method: 'POST',
      url: '/',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'accessCode='
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain('Enter your access code')
  })

  test('Should show error when access code is whitespace only', async () => {
    const { result, statusCode } = await server.inject({
      method: 'POST',
      url: '/',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'accessCode=%20%20%20'
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain('Enter your access code')
  })

  test('Should show error when payload is missing', async () => {
    const { result, statusCode } = await server.inject({
      method: 'POST',
      url: '/',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: ''
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain('Enter your access code')
  })

  test('Should redirect to /home when valid access code is provided', async () => {
    const { statusCode, headers } = await server.inject({
      method: 'POST',
      url: '/',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'accessCode=92a238b4-db01-4aa0-aa0c-85f42aff0887'
    })

    expect(statusCode).toBe(302)
    expect(headers.location).toBe('/home')
  })

  test('Should show error when access code is invalid', async () => {
    const { result, statusCode } = await server.inject({
      method: 'POST',
      url: '/',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'accessCode=wrong-code-12345'
    })

    expect(statusCode).toBe(statusCodes.ok)
    expect(result).toContain('Enter your valid access code')
  })

  test('Should set session values on successful login', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'accessCode=92a238b4-db01-4aa0-aa0c-85f42aff0887'
    })

    expect(res.statusCode).toBe(302)

    // Use the session cookie to access a protected route
    const cookie = res.headers['set-cookie']?.[0]?.split(';')[0]
    const homeRes = await server.inject({
      method: 'GET',
      url: '/home',
      headers: { cookie }
    })

    expect(homeRes.statusCode).toBe(statusCodes.ok)
  })
})
